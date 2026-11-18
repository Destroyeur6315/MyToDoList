'use strict';

/**
 * Account routes: register, login, logout and current session.
 * Mounted on `/api/auth`, before the authentication guard.
 */

const express = require('express');
const { HttpError } = require('../http/errors');
const { validateRegistration, parseLogin } = require('../domain/validation');
const { hashPassword, verifyPassword, needsRehash, generateId, DUMMY_HASH } = require('../security/crypto');

const USERNAME_TAKEN = 'Cet identifiant existe déjà.';
const BAD_CREDENTIALS = 'Identifiant ou mot de passe incorrect.';

const isUniqueViolation = err => typeof err?.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT');

/**
 * @param {object} deps
 * @param {ReturnType<import('../db/repositories/userRepository').createUserRepository>} deps.users
 * @param {ReturnType<import('../http/session').createSessionManager>} deps.sessionManager
 * @param {{ login: import('express').RequestHandler[], register: import('express').RequestHandler }} deps.rateLimiters
 *   Brute-force protection (see src/http/rateLimits.js).
 */
function createAuthRouter({ users, sessionManager, rateLimiters }) {
  const router = express.Router();

  router.get('/me', (req, res) => {
    res.json(req.user ? { user: req.user, session: req.authSession } : { user: null });
  });

  router.post('/register', rateLimiters.register, async (req, res) => {
    const { username, password } = validateRegistration(req.body);
    if (users.usernameExists(username)) throw new HttpError(409, USERNAME_TAKEN);

    const id = generateId();
    const passwordHash = await hashPassword(password);
    try {
      users.create({ id, username, passwordHash, createdAt: Date.now() });
    } catch (err) {
      // Another request may have taken the name while we were hashing.
      if (isUniqueViolation(err)) throw new HttpError(409, USERNAME_TAKEN);
      throw err;
    }

    const session = sessionManager.start(req, res, id);
    res.status(201).json({ user: { id, username }, session });
  });

  router.post('/login', ...rateLimiters.login, async (req, res) => {
    const credentials = parseLogin(req.body);
    if (!credentials) throw new HttpError(401, BAD_CREDENTIALS);

    const user = users.findByUsername(credentials.username);
    // Always run scrypt, even for unknown users, so timing reveals nothing.
    const valid = await verifyPassword(credentials.password, user?.passwordHash || DUMMY_HASH);
    if (!user || !valid) throw new HttpError(401, BAD_CREDENTIALS);

    // Transparent upgrade of hashes created with weaker parameters.
    if (needsRehash(user.passwordHash)) {
      users.updatePasswordHash(user.id, await hashPassword(credentials.password));
    }

    // Drop any previous session carried by this browser (session fixation).
    sessionManager.revoke(req);
    const session = sessionManager.start(req, res, user.id);
    res.json({ user: { id: user.id, username: user.username }, session });
  });

  router.post('/logout', (req, res) => {
    sessionManager.end(req, res);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createAuthRouter };
