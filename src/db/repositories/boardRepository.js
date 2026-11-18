'use strict';

/**
 * Data access for a user's board: lists, tasks and the revision counter.
 * Every mutation bumps the user's revision inside the same transaction, so
 * clients can detect concurrent edits (optimistic locking).
 */

const { inTransaction } = require('../database');

const LIST_COLUMNS = 'id, name, archived, archived_at AS archivedAt, created_at AS createdAt';
const TASK_COLUMNS = `id, list_id AS listId, name, description, duration, criticality, status,
  created_at AS createdAt, completed_at AS completedAt`;

/** SQLite stores booleans as 0/1: convert back for the API. */
const toList = row => row && { ...row, archived: Boolean(row.archived) };

/** @param {import('node:sqlite').DatabaseSync} db */
function createBoardRepository(db) {
  const statements = {
    metadata: db.prepare('SELECT revision, updated_at AS updatedAt FROM metadata WHERE user_id = ?'),
    bumpRevision: db.prepare('UPDATE metadata SET revision = revision + 1, updated_at = ? WHERE user_id = ?'),

    allLists: db.prepare(`SELECT ${LIST_COLUMNS} FROM lists WHERE user_id = ? ORDER BY created_at ASC`),
    countLists: db.prepare('SELECT COUNT(*) AS count FROM lists WHERE user_id = ?'),
    findList: db.prepare(`SELECT ${LIST_COLUMNS} FROM lists WHERE user_id = ? AND id = ?`),
    insertList: db.prepare(`INSERT INTO lists (user_id, id, name, archived, archived_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`),
    updateList: db.prepare('UPDATE lists SET name = ?, archived = ?, archived_at = ? WHERE user_id = ? AND id = ?'),
    deleteList: db.prepare('DELETE FROM lists WHERE user_id = ? AND id = ?'),
    deleteAllLists: db.prepare('DELETE FROM lists WHERE user_id = ?'),

    allTasks: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? ORDER BY created_at ASC`),
    countTasks: db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE user_id = ?'),
    findTask: db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE user_id = ? AND id = ?`),
    insertTask: db.prepare(`INSERT INTO tasks (user_id, id, list_id, name, description, duration, criticality,
      status, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateTask: db.prepare(`UPDATE tasks SET list_id = ?, name = ?, description = ?, duration = ?, criticality = ?,
      status = ?, completed_at = ? WHERE user_id = ? AND id = ?`),
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

  const insertList = (userId, l) =>
    statements.insertList.run(userId, l.id, l.name, Number(l.archived), l.archivedAt, l.createdAt);
  const insertTask = (userId, t) =>
    statements.insertTask.run(userId, t.id, t.listId, t.name, t.description, t.duration,
      t.criticality, t.status, t.createdAt, t.completedAt);

  return {
    /** Full snapshot of the user's board. */
    readState(userId) {
      const meta = statements.metadata.get(userId);
      return {
        lists: statements.allLists.all(userId).map(toList),
        tasks: statements.allTasks.all(userId),
        revision: meta?.revision || 0,
        updatedAt: meta?.updatedAt || 0
      };
    },

    /**
     * Replaces the whole board if `expectedRevision` is still current.
     * @returns {boolean} `false` when the revision is stale (concurrent edit).
     */
    replaceState(userId, expectedRevision, lists, tasks) {
      return inTransaction(db, () => {
        const current = statements.metadata.get(userId)?.revision ?? 0;
        if (current !== expectedRevision) return false;
        statements.deleteAllTasks.run(userId);
        statements.deleteAllLists.run(userId);
        for (const list of lists) insertList(userId, list);
        for (const task of tasks) insertTask(userId, task);
        bump(userId);
        return true;
      });
    },

    allLists: userId => statements.allLists.all(userId).map(toList),
    findList: (userId, id) => toList(statements.findList.get(userId, id)),
    listExists: (userId, id) => Boolean(statements.findList.get(userId, id)),
    /** @returns {boolean} `false` when the user already has `maxLists` lists. */
    createList: (userId, list, maxLists) =>
      insertWithinQuota(statements.countLists, maxLists, userId, () => insertList(userId, list)),
    updateList: (userId, l) => write(userId, () =>
      statements.updateList.run(l.name, Number(l.archived), l.archivedAt, userId, l.id)),
    /** Tasks of the list are removed by `ON DELETE CASCADE`. */
    deleteList: (userId, id) => remove(statements.deleteList, userId, id),

    allTasks: userId => statements.allTasks.all(userId),
    findTask: (userId, id) => statements.findTask.get(userId, id),
    /** @returns {boolean} `false` when the user already has `maxTasks` tasks. */
    createTask: (userId, task, maxTasks) =>
      insertWithinQuota(statements.countTasks, maxTasks, userId, () => insertTask(userId, task)),
    updateTask: (userId, t) => write(userId, () =>
      statements.updateTask.run(t.listId, t.name, t.description, t.duration, t.criticality,
        t.status, t.completedAt, userId, t.id)),
    deleteTask: (userId, id) => remove(statements.deleteTask, userId, id)
  };
}

module.exports = { createBoardRepository };
