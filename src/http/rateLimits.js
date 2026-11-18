'use strict';

/**
 * Brute-force protection for the account routes.
 *
 * Login attempts are limited without allowing account lockout: only failed
 * attempts are counted, per client IP and per (client IP + username) pair.
 * Someone hammering a username from their address only blocks themselves;
 * the owner of the account, coming from another address, can still log in.
 */

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const TOO_MANY = { error: 'Trop de tentatives. Réessayez dans quelques minutes.' };

const COMMON = Object.freeze({ standardHeaders: 'draft-8', legacyHeaders: false, message: TOO_MANY });

/** Client key: IPv6 addresses are grouped by /56 so one host cannot rotate them. */
const clientKey = req => ipKeyGenerator(req.ip);

/** Usernames are case-insensitive: normalize before using them as a key. */
const usernameKey = req => String(req.body?.username ?? '').trim().toLowerCase().slice(0, 64);

/**
 * @param {{ login: { windowMs: number, perIp: number, perAccount: number },
 *           register: { windowMs: number, limit: number } }} options
 * @returns {{ login: import('express').RequestHandler[], register: import('express').RequestHandler }}
 */
function createAuthRateLimiters(options) {
  const failedLoginsPerIp = rateLimit({
    ...COMMON,
    windowMs: options.login.windowMs,
    limit: options.login.perIp,
    skipSuccessfulRequests: true,
    keyGenerator: clientKey
  });

  // Several failures on one account from one address (password guessing).
  const failedLoginsPerAccount = rateLimit({
    ...COMMON,
    windowMs: options.login.windowMs,
    limit: options.login.perAccount,
    skipSuccessfulRequests: true,
    keyGenerator: req => `${clientKey(req)}|${usernameKey(req)}`
  });

  // Every registration counts: limits mass account creation.
  const registrations = rateLimit({
    ...COMMON,
    windowMs: options.register.windowMs,
    limit: options.register.limit,
    keyGenerator: clientKey
  });

  return { login: [failedLoginsPerIp, failedLoginsPerAccount], register: registrations };
}

module.exports = { createAuthRateLimiters };
