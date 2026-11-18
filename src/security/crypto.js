'use strict';

/**
 * Password hashing (scrypt with a per-user random salt) and random tokens.
 *
 * Stored format: `scrypt:<N>:<r>:<p>:<salt hex>:<hash hex>`. The cost
 * parameters are kept with each hash so they can be raised later; hashes
 * using older parameters are upgraded at the next successful login.
 * The original format `scrypt:<salt hex>:<hash hex>` (Node defaults
 * N=16384, r=8, p=1) is still accepted.
 */

const { randomBytes, createHash, scrypt: scryptCallback, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const ALGORITHM = 'scrypt';

/** OWASP recommendation (~128 MiB of memory per hash). */
const CURRENT_PARAMS = Object.freeze({ N: 2 ** 17, r: 8, p: 1 });
const LEGACY_PARAMS = Object.freeze({ N: 2 ** 14, r: 8, p: 1 });

/** scrypt needs 128 * N * r bytes; leave headroom above that. */
const maxmemFor = ({ N, r }) => 256 * N * r;

const derive = (password, salt, params) =>
  scrypt(password, salt, KEY_LENGTH, { ...params, maxmem: maxmemFor(params) });

const isPowerOfTwo = n => Number.isSafeInteger(n) && n > 1 && (n & (n - 1)) === 0;

/**
 * Parses a stored hash; returns `null` when it is malformed or uses
 * parameters outside a safe range (protects against costly inputs).
 */
function parseHash(stored) {
  const parts = String(stored || '').split(':');
  if (parts[0] !== ALGORITHM) return null;

  if (parts.length === 3) return { params: LEGACY_PARAMS, salt: parts[1], hash: parts[2] };
  if (parts.length !== 6) return null;

  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (!isPowerOfTwo(N) || N > 2 ** 20 || !(r >= 1 && r <= 32) || !(p >= 1 && p <= 16)) return null;
  return { params: { N, r, p }, salt: parts[4], hash: parts[5] };
}

const format = ({ N, r, p }, salt, hash) => [ALGORITHM, N, r, p, salt, hash].join(':');

/**
 * Well-formed hash, with the current parameters, that matches no password.
 * Verifying against it when the user does not exist keeps login timing
 * identical (no username enumeration).
 */
const DUMMY_HASH = format(CURRENT_PARAMS, '0'.repeat(32), '00'.repeat(KEY_LENGTH));

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await derive(password, salt, CURRENT_PARAMS);
  return format(CURRENT_PARAMS, salt, derived.toString('hex'));
}

/** Constant-time comparison of `password` with a stored hash. */
async function verifyPassword(password, stored) {
  const parsed = parseHash(stored);
  if (!parsed || !parsed.salt || !parsed.hash) return false;
  const derived = await derive(password, parsed.salt, parsed.params);
  const expected = Buffer.from(parsed.hash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

/** Whether a (valid) stored hash should be recomputed with the current parameters. */
function needsRehash(stored) {
  const parsed = parseHash(stored);
  return !parsed || Object.keys(CURRENT_PARAMS).some(key => parsed.params[key] !== CURRENT_PARAMS[key]);
}

/** Opaque, URL-safe session token (256 bits). */
const generateToken = () => randomBytes(32).toString('base64url');

/** Random 128-bit hex identifier for users, lists and tasks. */
const generateId = () => randomBytes(16).toString('hex');

const sha256 = value => createHash('sha256').update(value).digest('hex');

module.exports = { hashPassword, verifyPassword, needsRehash, generateToken, generateId, sha256, DUMMY_HASH };
