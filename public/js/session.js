/**
 * Client-side mirror of the server session limits.
 *
 * The server ends a session 10 h after login, or after 30 min without any
 * request. Reading or scrolling the board sends no request, so while the
 * user is active this module sends a lightweight heartbeat (`GET /api/auth/me`,
 * at most once a minute) to keep the session alive. When either limit is
 * reached, the UI is locked immediately instead of waiting for the next
 * failed request.
 */

import { api } from './api.js';
import { SESSION_CHECK_INTERVAL_MS, SESSION_HEARTBEAT_INTERVAL_MS } from './constants.js';

/** DOM events that count as user activity. */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
const LISTENER_OPTIONS = { capture: true, passive: true };

/** @typedef {'idle' | 'lifetime' | 'revoked'} ExpiryReason */

let checkTimer = null;
let idleTimeoutMs = 0;
let expiresAt = 0;          // Absolute end of the session (client clock).
let lastServerContact = 0;  // When the server last reset its inactivity timer.
let heartbeatInFlight = false;
/** @type {(reason: ExpiryReason) => void} */
let onExpire = () => {};

const isWatching = () => checkTimer !== null;

function expire(reason) {
  stopSessionWatch();
  onExpire(reason);
}

/**
 * Locks the session if a limit is reached.
 * @returns {boolean} `true` if the session has expired.
 */
function checkExpiry() {
  if (!isWatching()) return true;
  const now = Date.now();
  if (now >= expiresAt) expire('lifetime');
  else if (now - lastServerContact >= idleTimeoutMs) expire('idle');
  return !isWatching();
}

async function sendHeartbeat() {
  if (heartbeatInFlight) return;
  heartbeatInFlight = true;
  // Taken before sending: the server touches the session after this moment,
  // so the client never believes the session lasts longer than it does.
  const sentAt = Date.now();
  try {
    const { user } = await api.me();
    if (!isWatching()) return;
    if (user) lastServerContact = sentAt;
    else expire('revoked');
  } catch {
    // Network error: the next activity will retry.
  } finally {
    heartbeatInFlight = false;
  }
}

function handleActivity() {
  // Returning after a long absence must not revive an expired session.
  if (checkExpiry()) return;
  if (Date.now() - lastServerContact >= SESSION_HEARTBEAT_INTERVAL_MS) sendHeartbeat();
}

function handleVisibilityChange() {
  // Background tabs throttle timers: check as soon as the page is visible.
  if (document.visibilityState === 'visible') checkExpiry();
}

/**
 * Starts watching a freshly opened or restored session.
 * @param {{ expiresInMs: number, idleTimeoutMs: number }} session Timing sent by the server.
 * @param {(reason: ExpiryReason) => void} handleExpiry Called once when the session ends.
 */
export function startSessionWatch(session, handleExpiry) {
  stopSessionWatch();
  const now = Date.now();
  expiresAt = now + session.expiresInMs;
  idleTimeoutMs = session.idleTimeoutMs;
  lastServerContact = now;
  onExpire = handleExpiry;

  ACTIVITY_EVENTS.forEach(type => window.addEventListener(type, handleActivity, LISTENER_OPTIONS));
  document.addEventListener('visibilitychange', handleVisibilityChange);
  checkTimer = setInterval(checkExpiry, SESSION_CHECK_INTERVAL_MS);
}

/** Stops watching (logout, expiry). Safe to call when not watching. */
export function stopSessionWatch() {
  if (!isWatching()) return;
  clearInterval(checkTimer);
  checkTimer = null;
  ACTIVITY_EVENTS.forEach(type => window.removeEventListener(type, handleActivity, LISTENER_OPTIONS));
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}
