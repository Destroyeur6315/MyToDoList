'use strict';

/**
 * Data access for user accounts.
 */

const { inTransaction } = require('../database');

/** @param {import('node:sqlite').DatabaseSync} db */
function createUserRepository(db) {
  const statements = {
    exists: db.prepare('SELECT 1 FROM users WHERE username = ?'),
    findByUsername: db.prepare('SELECT id, username, password_hash AS passwordHash FROM users WHERE username = ?'),
    insertUser: db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)'),
    insertMetadata: db.prepare('INSERT INTO metadata (user_id) VALUES (?)'),
    updatePasswordHash: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
  };

  return {
    /** Usernames are case-insensitive (COLLATE NOCASE). */
    usernameExists(username) {
      return Boolean(statements.exists.get(username));
    },

    /** @returns {{ id: string, username: string, passwordHash: string } | undefined} */
    findByUsername(username) {
      return statements.findByUsername.get(username);
    },

    /**
     * Creates the account and its revision row atomically.
     * Throws a `SQLITE_CONSTRAINT*` error if the username is already taken.
     */
    create({ id, username, passwordHash, createdAt }) {
      inTransaction(db, () => {
        statements.insertUser.run(id, username, passwordHash, createdAt);
        statements.insertMetadata.run(id);
      });
    },

    /** Replaces the stored hash (used to upgrade the hashing parameters). */
    updatePasswordHash(id, passwordHash) {
      statements.updatePasswordHash.run(passwordHash, id);
    }
  };
}

module.exports = { createUserRepository };
