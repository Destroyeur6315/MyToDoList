'use strict';

/**
 * Runtime configuration, read once from environment variables.
 * Every tunable value of the server lives here so the rest of the code
 * never touches `process.env` directly.
 */

const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const isProduction = process.env.NODE_ENV === 'production';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

module.exports = Object.freeze({
  port: Number(process.env.PORT || 3000),
  isProduction,
  /** Number of reverse-proxy hops to trust (production only). */
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  dbPath: path.resolve(process.env.DB_PATH || path.join(ROOT_DIR, 'data', 'mytodolist.sqlite')),
  publicDir: path.join(ROOT_DIR, 'public'),
  jsonBodyLimit: '1mb',

  session: Object.freeze({
    // The `__Host-` prefix requires HTTPS, so it is only used in production.
    cookieName: isProduction ? '__Host-mytodolist_session' : 'mytodolist_session',
    /** Absolute lifetime: a new login is required after a working day. */
    maxAgeMs: 10 * HOUR_MS,
    /** Inactivity limit: no authenticated request for this long ends the session. */
    idleTimeoutMs: 30 * MINUTE_MS,
    cleanupIntervalMs: 15 * MINUTE_MS
  }),

  /** Brute-force protection of the account routes (see src/http/rateLimits.js). */
  authRateLimits: Object.freeze({
    login: Object.freeze({ windowMs: 15 * MINUTE_MS, perIp: 20, perAccount: 5 }),
    register: Object.freeze({ windowMs: HOUR_MS, limit: 10 })
  })
});
