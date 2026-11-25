'use strict';

/**
 * Data access for a user's board: tabs, lists, tasks and the revision counter.
 * Every mutation bumps the user's revision inside the same transaction, so
 * clients can detect concurrent edits (optimistic locking).
 */

const { inTransaction } = require('../database');

const TAB_COLUMNS = 'id, name, position, created_at AS createdAt';
const LIST_COLUMNS = 'id, tab_id AS tabId, name, archived, archived_at AS archivedAt, created_at AS createdAt';
const TASK_COLUMNS = `id, list_id AS listId, name, description, duration, criticality, status, position,
  created_at AS createdAt, completed_at AS completedAt`;

/** SQLite stores booleans as 0/1: convert back for the API. */
const toList = row => row && { ...row, archived: Boolean(row.archived) };

/** @param {import('node:sqlite').DatabaseSync} db */
function createBoardRepository(db) {
  const statements = {
    metadata: db.prepare('SELECT revision, updated_at AS updatedAt FROM metadata WHERE user_id = ?'),
    bumpRevision: db.prepare('UPDATE metadata SET revision = revision + 1, updated_at = ? WHERE user_id = ?'),

    allTabs: db.prepare(`SELECT ${TAB_COLUMNS} FROM tabs WHERE user_id = ? ORDER BY position ASC, created_at ASC`),
    countTabs: db.prepare('SELECT COUNT(*) AS count FROM tabs WHERE user_id = ?'),
    findTab: db.prepare(`SELECT ${TAB_COLUMNS} FROM tabs WHERE user_id = ? AND id = ?`),
    nextTabPosition: db.prepare('SELECT COALESCE(MAX(position) + 1, 0) AS position FROM tabs WHERE user_id = ?'),
    insertTab: db.prepare('INSERT INTO tabs (user_id, id, name, position, created_at) VALUES (?, ?, ?, ?, ?)'),
    renameTab: db.prepare('UPDATE tabs SET name = ? WHERE user_id = ? AND id = ?'),
    setTabPosition: db.prepare('UPDATE tabs SET position = ? WHERE user_id = ? AND id = ?'),
    deleteTab: db.prepare('DELETE FROM tabs WHERE user_id = ? AND id = ?'),
    deleteTabLists: db.prepare('DELETE FROM lists WHERE user_id = ? AND tab_id = ?'),
    deleteAllTabs: db.prepare('DELETE FROM tabs WHERE user_id = ?'),

    allLists: db.prepare(`SELECT ${LIST_COLUMNS} FROM lists WHERE user_id = ? ORDER BY created_at ASC`),
    countLists: db.prepare('SELECT COUNT(*) AS count FROM lists WHERE user_id = ?'),
    findList: db.prepare(`SELECT ${LIST_COLUMNS} FROM lists WHERE user_id = ? AND id = ?`),
    insertList: db.prepare(`INSERT INTO lists (user_id, id, tab_id, name, archived, archived_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`),
    updateList: db.prepare(`UPDATE lists SET tab_id = ?, name = ?, archived = ?, archived_at = ?
      WHERE user_id = ? AND id = ?`),
    deleteList: db.prepare('DELETE FROM lists WHERE user_id = ? AND id = ?'),
    deleteAllLists: db.prepare('DELETE FROM lists WHERE user_id = ?'),

    allTasks: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? ORDER BY created_at ASC`),
    countTasks: db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE user_id = ?'),
    findTask: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? AND id = ?`),
    insertTask: db.prepare(`INSERT INTO tasks (user_id, id, list_id, name, description, duration, criticality,
      status, position, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateTask: db.prepare(`UPDATE tasks SET list_id = ?, name = ?, description = ?, duration = ?, criticality = ?,
      status = ?, position = ?, completed_at = ? WHERE user_id = ? AND id = ?`),
    deleteTask: db.prepare('DELETE FROM tasks WHERE user_id = ? AND id = ?'),
    deleteAllTasks: db.prepare('DELETE FROM tasks WHERE user_id = ?')
  };

  const bump = userId => statements.bumpRevision.run(Date.now(), userId);

  /** Runs a write and bumps the revision atomically. */
  const write = (userId, work) => inTransaction(db, () => {
    const result = work();
    bump(userId);
    return result;
  });

  /** Runs a delete and bumps the revision only if a row was removed. */
  const remove = (statement, userId, id) => inTransaction(db, () => {
    const { changes } = statement.run(userId, id);
    if (changes) bump(userId);
    return changes > 0;
  });

  /**
   * Inserts a row unless the user already owns `max` rows. Count and insert
   * share one transaction, so concurrent requests cannot exceed the quota.
   * @returns {boolean} `false` when the quota is reached.
   */
  const insertWithinQuota = (countStatement, max, userId, insert) => inTransaction(db, () => {
    if (Number(countStatement.get(userId).count) >= max) return false;
    insert();
    bump(userId);
    return true;
  });

  const insertTab = (userId, t, position) =>
    statements.insertTab.run(userId, t.id, t.name, position, t.createdAt);
  const insertList = (userId, l) =>
    statements.insertList.run(userId, l.id, l.tabId, l.name, Number(l.archived), l.archivedAt, l.createdAt);

  /** Rewrites positions 0..n-1 following the order of `tabIds`. */
  const writeTabOrder = (userId, tabIds) =>
    tabIds.forEach((id, position) => statements.setTabPosition.run(position, userId, id));
  const insertTask = (userId, t) =>
    statements.insertTask.run(userId, t.id, t.listId, t.name, t.description, t.duration,
      t.criticality, t.status, t.position, t.createdAt, t.completedAt);

  return {
    /** Full snapshot of the user's board. */
    readState(userId) {
      const meta = statements.metadata.get(userId);
      return {
        tabs: statements.allTabs.all(userId),
        lists: statements.allLists.all(userId).map(toList),
        tasks: statements.allTasks.all(userId),
        revision: meta?.revision || 0,
        updatedAt: meta?.updatedAt || 0
      };
    },

    /**
     * Replaces the whole board if `expectedRevision` is still current.
     * Tabs are stored in the order of the `tabs` array (leftmost first).
     * @returns {boolean} `false` when the revision is stale (concurrent edit).
     */
    replaceState(userId, expectedRevision, { tabs, lists, tasks }) {
      return inTransaction(db, () => {
        const current = statements.metadata.get(userId)?.revision ?? 0;
        if (current !== expectedRevision) return false;
        statements.deleteAllTasks.run(userId);
        statements.deleteAllLists.run(userId);
        statements.deleteAllTabs.run(userId);
        tabs.forEach((tab, position) => insertTab(userId, tab, position));
        for (const list of lists) insertList(userId, list);
        for (const task of tasks) insertTask(userId, task);
        bump(userId);
        return true;
      });
    },

    allTabs: userId => statements.allTabs.all(userId),
    findTab: (userId, id) => statements.findTab.get(userId, id),
    tabExists: (userId, id) => Boolean(statements.findTab.get(userId, id)),
    /** Leftmost tab: where lists created without a tab go. */
    firstTab: userId => statements.allTabs.all(userId)[0],

    /**
     * Appends a tab after the existing ones.
     * @returns {object | null} The stored tab, or `null` when the user already has `maxTabs` tabs.
     */
    createTab: (userId, tab, maxTabs) => inTransaction(db, () => {
      if (Number(statements.countTabs.get(userId).count) >= maxTabs) return null;
      const { position } = statements.nextTabPosition.get(userId);
      insertTab(userId, tab, position);
      bump(userId);
      return { ...tab, position };
    }),

    /**
     * Renames a tab and/or moves it to `position` (0 = leftmost, clamped to
     * the number of tabs); the other tabs shift to make room.
     * @param {{ name?: string, position?: number }} changes
     * @returns {object | null} The updated tab, or `null` if it does not exist.
     */
    updateTab: (userId, id, { name, position }) => inTransaction(db, () => {
      if (!statements.findTab.get(userId, id)) return null;
      if (name !== undefined) statements.renameTab.run(name, userId, id);
      if (position !== undefined) {
        const order = statements.allTabs.all(userId).map(t => t.id).filter(tabId => tabId !== id);
        order.splice(Math.min(position, order.length), 0, id);
        writeTabOrder(userId, order);
      }
      bump(userId);
      return statements.findTab.get(userId, id);
    }),

    /**
     * Deletes a tab with its lists (archived ones included) and their tasks.
     * The last remaining tab cannot be deleted.
     * @returns {'deleted' | 'not-found' | 'last-tab'}
     */
    deleteTab: (userId, id) => inTransaction(db, () => {
      if (!statements.findTab.get(userId, id)) return 'not-found';
      if (Number(statements.countTabs.get(userId).count) <= 1) return 'last-tab';
      // No foreign key between lists and tabs (see migrate()): delete the
      // lists explicitly; their tasks follow through ON DELETE CASCADE.
      statements.deleteTabLists.run(userId, id);
      statements.deleteTab.run(userId, id);
      writeTabOrder(userId, statements.allTabs.all(userId).map(t => t.id));
      bump(userId);
      return 'deleted';
    }),

    allLists: userId => statements.allLists.all(userId).map(toList),
    findList: (userId, id) => toList(statements.findList.get(userId, id)),
    listExists: (userId, id) => Boolean(statements.findList.get(userId, id)),
    /** @returns {boolean} `false` when the user already has `maxLists` lists. */
    createList: (userId, list, maxLists) =>
      insertWithinQuota(statements.countLists, maxLists, userId, () => insertList(userId, list)),
    updateList: (userId, l) => write(userId, () =>
      statements.updateList.run(l.tabId, l.name, Number(l.archived), l.archivedAt, userId, l.id)),
    /** Tasks of the list are removed by `ON DELETE CASCADE`. */
    deleteList: (userId, id) => remove(statements.deleteList, userId, id),

    allTasks: userId => statements.allTasks.all(userId),
    findTask: (userId, id) => statements.findTask.get(userId, id),
    /** @returns {boolean} `false` when the user already has `maxTasks` tasks. */
    createTask: (userId, task, maxTasks) =>
      insertWithinQuota(statements.countTasks, maxTasks, userId, () => insertTask(userId, task)),
    updateTask: (userId, t) => write(userId, () =>
      statements.updateTask.run(t.listId, t.name, t.description, t.duration, t.criticality,
        t.status, t.position, t.completedAt, userId, t.id)),
    deleteTask: (userId, id) => remove(statements.deleteTask, userId, id)
  };
}

module.exports = { createBoardRepository };
