'use strict';

/**
 * HTTP error type shared by routes and middleware. Any `HttpError` thrown in a
 * route is turned into `{ error: message }` with its status by the error handler.
 */
class HttpError extends Error {
  /**
   * @param {number} status HTTP status code.
   * @param {string} message User-facing message (sent to the client).
   */
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** Input that fails validation (400 Bad Request). */
class ValidationError extends HttpError {
  constructor(message) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

module.exports = { HttpError, ValidationError };
