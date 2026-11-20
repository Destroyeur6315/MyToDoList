'use strict';

/**
 * SQLite connection, schema and transaction helper (built-in `node:sqlite`).
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { DEFAULT_TAB_NAME } = require('../domain/validation');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash   TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at   INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

  -- Tabs group the lists of a user ("Perso", "Boulot"…). The position is the
  -- display order, from left (0) to right.
  CREATE TABLE IF NOT EXISTS tabs (
    id         TEXT NOT NULL,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(user_id, id)
  );

  CREATE TABLE IF NOT EXISTS lists (
    id          TEXT NOT NULL,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    archived    INTEGER NOT NULL DEFAULT 0,
    archived_at INTEGER,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY(user_id, id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT NOT NULL,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    list_id      TEXT NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    duration     TEXT NOT NULL DEFAULT 'h1',
    criticality  INTEGER NOT NULL DEFAULT 3,
    status       TEXT NOT NULL DEFAULT 'todo',
    created_at   INTEGER NOT NULL,
    completed_at INTEGER,
    PRIMARY KEY(user_id, id),
    FOREIGN KEY(user_id, list_id) REFERENCES lists(user_id, id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(user_id, list_id);

  -- One row per user: the revision is an optimistic-locking counter
  -- incremented on every write to that user's lists or tasks.
  CREATE TABLE IF NOT EXISTS metadata (
    user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    revision   INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`;

/** Column names of `table` (parameterized through the pragma table-valued function). */
const columnsOf = (db, table) => db.prepare('SELECT name FROM pragma_table_info(?)').all(table).map(column => column.name);

/**
 * Creates the default tab of every user who has none, and moves lists that
 * belong to no tab into the user's first tab. Ids use the same 32-hex-char
 * format as `generateId()`.
 * @param {DatabaseSync} db
 */
function ensureDefaultTabs(db) {
  db.prepare(`INSERT INTO tabs (user_id, id, name, position, created_at)
    SELECT u.id, lower(hex(randomblob(16))), ?, 0, ?
    FROM users u WHERE NOT EXISTS (SELECT 1 FROM tabs t WHERE t.user_id = u.id)`)
    .run(DEFAULT_TAB_NAME, Date.now());
  db.exec(`UPDATE lists SET tab_id = (
      SELECT t.id FROM tabs t WHERE t.user_id = lists.user_id ORDER BY t.position, t.created_at LIMIT 1)
    WHERE tab_id = ''`);
}

/**
 * Upgrades databases created by older versions. Each step is idempotent.
 * @param {DatabaseSync} db
 */
function migrate(db) {
  if (!columnsOf(db, 'sessions').includes('last_seen_at')) {
    // Existing sessions get last_seen_at = 0, i.e. they are idle-expired:
    // their owners simply log in again under the new session rules.
    db.exec('ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0');
  }

  // Lists belong to a tab. The column is added here (not in SCHEMA) so new and
  // upgraded databases share one definition. SQLite cannot add a composite
  // foreign key to an existing table: the repository deletes a tab's lists
  // itself, and snapshot validation checks every list's tab.
  if (!columnsOf(db, 'lists').includes('tab_id')) {
    db.exec("ALTER TABLE lists ADD COLUMN tab_id TEXT NOT NULL DEFAULT ''");
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_lists_tab ON lists(user_id, tab_id)');
  inTransaction(db, () => ensureDefaultTabs(db));
}

/**
 * Opens (and creates if needed) the database file and applies the schema.
 * @param {string} file Absolute path of the SQLite file.
 * @returns {DatabaseSync}
 */
function openDatabase(file) {
  // Owner-only access on Unix (no effect on Windows, which uses ACLs).
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/**
 * Runs `work` inside an immediate transaction: committed if it returns,
 * rolled back if it throws.
 * @template T
 * @param {DatabaseSync} db
 * @param {() => T} work
 * @returns {T}
 */
function inTransaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDatabase, inTransaction };
