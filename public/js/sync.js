/**
 * Synchronisation of the in-memory board with the server.
 *
 * Saves are sequential and coalesced: while a save is in flight, further
 * changes only mark the state dirty, and the loop sends one more snapshot
 * when the current request ends. A slow response can therefore never
 * overwrite a more recent change. The server `revision` detects edits made
 * elsewhere (another tab or device) and answers 409 instead of overwriting.
 */

import { api } from './api.js';
import { SAVE_RETRY_INTERVAL_MS } from './constants.js';
import { state } from './state.js';

let active = false;          // A user is logged in and saves are allowed.
let revision = 0;            // Last revision acknowledged by the server.
let dirty = false;           // Local changes not yet sent.
/** @type {Promise<boolean> | null} */
let inFlight = null;

let handlers = {
  /** @param {import('./api.js').ApiError} err */
  onError: () => {},
  onUnauthorized: () => {}
};

/**
 * Registers UI callbacks and the background retry triggers.
 * @param {{ onError: (err: Error) => void, onUnauthorized: () => void }} callbacks
 */
export function initSync(callbacks) {
  handlers = { ...handlers, ...callbacks };

  window.addEventListener('online', () => { if (dirty) flushSaves(); });
  setInterval(() => { if (dirty && !inFlight && active) flushSaves(); }, SAVE_RETRY_INTERVAL_MS);
  // Warn before leaving the page with unsaved changes.
  window.addEventListener('beforeunload', event => {
    if (hasPendingChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

/** Enables saving for a freshly loaded account at the given server revision. */
export function startSync(serverRevision) {
  revision = serverRevision;
  dirty = false;
  active = true;
}

/** Disables saving and forgets pending changes (logout / expired session). */
export function stopSync() {
  active = false;
  dirty = false;
  revision = 0;
}

export const hasPendingChanges = () => dirty || inFlight !== null;

/** Records a local change and schedules a save. */
export function persist() {
  state.updatedAt = Date.now();
  dirty = true;
  flushSaves();
}

/**
 * Sends pending changes. Concurrent callers share the same in-flight run.
 * @returns {Promise<boolean>} `true` if everything was saved.
 */
export function flushSaves() {
  if (!inFlight) {
    inFlight = runSaveLoop().finally(() => { inFlight = null; });
  }
  return inFlight;
}

async function runSaveLoop() {
  while (dirty && active) {
    dirty = false;
    try {
      const saved = await api.saveState({ tabs: state.tabs, lists: state.lists, tasks: state.tasks, revision });
      revision = saved.revision;
    } catch (err) {
      dirty = true; // Keep the changes for a later retry.
      handlers.onError(err);
      if (err.status === 401) handlers.onUnauthorized();
      return false;
    }
  }
  return !dirty;
}
