'use strict';

/**
 * Data access for login sessions. Only a hash of each token is stored, so a
 * leaked database cannot be used to hijack sessions.
 */

/**
 * @typedef {object} SessionUser
 * @property {string} id
 * @property {string} username
 * @property {number} expiresAt  Absolute end of the session (epoch ms).
 * @property {number} lastSeenAt Last authenticated request (epoch ms).
 */

/** @param {import('node:sqlite').DatabaseSync} db */
function createSessionRepository(db) {
  const statements = {
    insert: db.prepare(
      'INSERT INTO sessions (token_hash, user_id, expires_at, last_seen_at) VALUES (?, ?, ?, ?)'),
    findUser: db.prepare(`
      SELECT u.id, u.username, s.expires_at AS expiresAt, s.last_seen_at AS lastSeenAt
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`),
    touch: db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?'),
    delete: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR last_seen_at <= ?')
  };

  return {
    /** Stores a new session, considered active as of `now`. */
    create(tokenHash, userId, expiresAt, now) {
      statements.insert.run(tokenHash, userId, expiresAt, now);
    },

    /** @returns {SessionUser | undefined} */
    findUserByTokenHash(tokenHash) {
      return statements.findUser.get(tokenHash);
    },

    /** Records activity on the session (resets the inactivity timer). */
    touch(tokenHash, now) {
      statements.touch.run(now, tokenHash);
    },

    delete(tokenHash) {
      statements.delete.run(tokenHash);
    },

    /**
     * Removes sessions past their absolute lifetime or idle for too long.
     * @param {number} now
     * @param {number} idleTimeoutMs
     */
    deleteExpired(now, idleTimeoutMs) {
      statements.deleteExpired.run(now, now - idleTimeoutMs);
    }
  };
}

module.exports = { createSessionRepository };