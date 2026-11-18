'use strict';

/**
 * Express application factory. Wires middleware, repositories and routes
 * around an already-open database, so tests can build isolated instances.
 */

const express = require('express');
const helmet = require('helmet');

const defaultConfig = require('./config');
const { createUserRepository } = require('./db/repositories/userRepository');
const { createSessionRepository } = require('./db/repositories/sessionRepository');
const { createBoardRepository } = require('./db/repositories/boardRepository');
const { createSessionManager, requireAuth } = require('./http/session');
const { createAuthRateLimiters } = require('./http/rateLimits');
const { noStore, requireSameOrigin, apiNotFound, errorHandler } = require('./http/middleware');
const { createAuthRouter } = require('./routes/authRoutes');
const { createBoardRouter } = require('./routes/boardRoutes');

/**
 * @param {object} options
 * @param {import('node:sqlite').DatabaseSync} options.db
 * @param {typeof defaultConfig} [options.config]
 * @param {() => number} [options.now] Clock used for session expiry (tests).
 * @returns {import('express').Express}
 */
function createApp({ db, config = defaultConfig, now = Date.now }) {
  const users = createUserRepository(db);
  const sessions = createSessionRepository(db);
  const board = createBoardRepository(db);
  const sessionManager = createSessionManager({
    sessions,
    options: config.session,
    secureCookies: config.isProduction,
    now
  });
  const rateLimiters = createAuthRateLimiters(config.authRateLimits);

  const app = express();
  if (config.isProduction) app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  // Every asset (scripts, CSS, fonts) is self-hosted, so the CSP only allows
  // the same origin. 'unsafe-inline' styles are needed for the `style=""`
  // attributes rendered by the UI (no inline <script> is allowed).
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"]
      }
    }
  }));
  app.use(express.json({ limit: config.jsonBodyLimit }));

  // ── API ── order matters: public auth routes come before the guard.
  app.use('/api', noStore, requireSameOrigin, sessionManager.loadUser);
  app.use('/api/auth', createAuthRouter({ users, sessionManager, rateLimiters }));
  app.use('/api', requireAuth, createBoardRouter({ board }));
  app.use('/api', apiNotFound);

  // ── Front-end ──
  app.use(express.static(config.publicDir, { index: 'index.html' }));

  app.use(errorHandler);

  // Exposed so the entry point can purge expired sessions periodically.
  app.locals.purgeExpiredSessions = () => sessionManager.purgeExpired();
  return app;
}

module.exports = { createApp };
