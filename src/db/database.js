'use strict';

/**
 * SQLite connection, schema and transaction helper (built-in `node:sqlite`).
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

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

/**
 * Upgrades databases created by older versions. Each step is idempotent.
 * @param {DatabaseSync} db
 */
function migrate(db) {
  const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all().map(column => column.name);
  if (!sessionColumns.includes('last_seen_at')) {
    // Existing sessions get last_seen_at = 0, i.e. they are idle-expired:
    // their owners simply log in again under the new session rules.
    db.exec('ALTER TABLE sessions ADD COLUMN last_seen_at INTEGER NOT NULL DEFAULT 0');
  }
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
