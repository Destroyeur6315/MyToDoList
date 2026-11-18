'use strict';

/**
 * Generic HTTP middleware: caching, cross-site request protection and the
 * final error handler.
 */

const { HttpError } = require('./errors');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** API responses are user-specific and must never be cached. */
function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

/**
 * CSRF protection for state-changing requests: the `Origin` (when sent) must
 * match this server, and the custom `X-MyToDoList-Request` header must be
 * present. Browsers cannot add custom headers cross-site without a CORS
 * preflight, which this server never grants.
 */
function requireSameOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  // `req.protocol` and `req.host` honour X-Forwarded-* headers when the
  // `trust proxy` setting is enabled (TRUST_PROXY), e.g. behind an HTTPS proxy.
  const expected = `${req.protocol}://${req.host}`;
  if (origin && origin !== expected) {
    console.warn(`Origine refusée : reçue "${origin}", attendue "${expected}". `
      + 'Derrière un reverse proxy HTTPS, définir TRUST_PROXY (ex. TRUST_PROXY=1).');
    return next(new HttpError(403, 'Origine non autorisée'));
  }
  if (req.get('X-MyToDoList-Request') !== '1') return next(new HttpError(403, 'En-tête de sécurité absent'));
  next();
}

/** Catch-all for unknown `/api` routes. */
function apiNotFound(req, res, next) {
  next(new HttpError(404, 'Route API introuvable'));
}

/**
 * Final error handler: known errors become `{ error }` JSON responses,
 * anything else is logged and hidden behind a generic 500.
 */
// eslint-disable-next-line no-unused-vars -- Express needs the 4-argument signature.
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requête trop volumineuse' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'JSON invalide' });
  console.error(err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
}

module.exports = { noStore, requireSameOrigin, apiNotFound, errorHandler };
