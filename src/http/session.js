'use strict';

/**
 * Cookie-based login sessions: creation, lookup (middleware) and revocation.
 * The browser holds a random token; the database only stores its SHA-256.
 *
 * A session ends at whichever comes first:
 *  - its absolute lifetime (`maxAgeMs`, counted from login);
 *  - `idleTimeoutMs` without any authenticated request (inactivity).
 * Expired sessions are deleted as soon as they are presented.
 */

const { generateToken, sha256 } = require('../security/crypto');
const { HttpError } = require('./errors');

/** Reads one cookie value from the raw `Cookie` header. */
function readCookie(req, name) {
  const prefix = `${name}=`;
  const entry = (req.headers.cookie || '')
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : null;
}

/**
 * Session timing sent to the browser, so it can lock the UI on time.
 * @typedef {{ expiresInMs: number, idleTimeoutMs: number }} SessionInfo
 */

/**
 * @param {object} deps
 * @param {ReturnType<import('../db/repositories/sessionRepository').createSessionRepository>} deps.sessions
 * @param {{ cookieName: string, maxAgeMs: number, idleTimeoutMs: number }} deps.options
 * @param {boolean} deps.secureCookies Always send the cookie over HTTPS only
 *   (production). Otherwise the cookie is still marked `Secure` whenever the
 *   request itself arrived over HTTPS.
 * @param {() => number} [deps.now] Clock (injectable for tests).
 */
function createSessionManager({ sessions, options, secureCookies, now = Date.now }) {
  const { cookieName, maxAgeMs, idleTimeoutMs } = options;
  const cookieOptionsFor = req =>
    ({ httpOnly: true, sameSite: 'lax', secure: secureCookies || req.secure, path: '/' });

  const tokenOf = req => readCookie(req, cookieName);

  /** @returns {SessionInfo} */
  const infoFor = (expiresAt, time) => ({ expiresInMs: expiresAt - time, idleTimeoutMs });

  const isExpired = (session, time) =>
    session.expiresAt <= time || time - session.lastSeenAt >= idleTimeoutMs;

  /** Revokes the request's session server-side without touching the cookie. */
  const revoke = req => {
    const token = tokenOf(req);
    if (token) sessions.delete(sha256(token));
  };

  return {
    revoke,

    /**
     * Opens a new session for `userId` and sets the cookie.
     * @returns {SessionInfo}
     */
    start(req, res, userId) {
      const token = generateToken();
      const time = now();
      const expiresAt = time + maxAgeMs;
      sessions.create(sha256(token), userId, expiresAt, time);
      // The cookie never outlives the server-side absolute lifetime.
      res.cookie(cookieName, token, { ...cookieOptionsFor(req), maxAge: maxAgeMs });
      return infoFor(expiresAt, time);
    },

    /** Revokes the request's session (if any) and clears the cookie. */
    end(req, res) {
      revoke(req);
      res.clearCookie(cookieName, cookieOptionsFor(req));
    },

    /**
     * Middleware: sets `req.user` (and `req.authSession`, a {@link SessionInfo})
     * when the request carries a valid session, and records the activity.
     */
    loadUser(req, res, next) {
      const token = tokenOf(req);
      if (!token) return next();

      const tokenHash = sha256(token);
      const session = sessions.findUserByTokenHash(tokenHash);
      if (!session) return next();

      const time = now();
      if (isExpired(session, time)) {
        sessions.delete(tokenHash);
        res.clearCookie(cookieName, cookieOptionsFor(req));
        return next();
      }

      sessions.touch(tokenHash, time);
      req.user = { id: session.id, username: session.username };
      req.authSession = infoFor(session.expiresAt, time);
      next();
    },

    /** Deletes every expired or idle session (periodic housekeeping). */
    purgeExpired() {
      sessions.deleteExpired(now(), idleTimeoutMs);
    }
  };
}

/** Middleware: rejects requests without an authenticated user. */
function requireAuth(req, res, next) {
  if (!req.user) return next(new HttpError(401, 'Session expirée. Reconnectez-vous.'));
  next();
}

module.exports = { createSessionManager, requireAuth, readCookie };