'use strict';

/**
 * Validation and normalization of client input. Each `normalize*` function
 * either returns a clean object containing only known fields, or throws a
 * `ValidationError` with a user-facing (French) message.
 */

const { ValidationError } = require('../http/errors');

const LIMITS = Object.freeze({
  tabName: 40,
  listName: 60,
  taskName: 120,
  taskDescription: 600,
  passwordMinLength: 12,
  passwordMaxBytes: 256,
  /** Per-account quotas, enforced on snapshots and on single creations. */
  maxTabs: 20,
  maxLists: 300,
  maxTasks: 5000
});

/** Name of the tab every account starts with (shown to users, hence French). */
const DEFAULT_TAB_NAME = 'Mes listes';

const DURATIONS = new Set(['min', 'h1', 'hours', 'h12', 'h24', 'days', 'week', 'week2', 'month']);
const STATUSES = new Set(['todo', 'doing', 'done']);
const CRITICALITY = Object.freeze({ min: 1, max: 4 });

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,32}$/;

const isSafeId = value => typeof value === 'string' && ID_PATTERN.test(value);

const isValidName = (value, maxLength) =>
  typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= maxLength;

/** Timestamps are milliseconds since epoch, or `null` when not applicable. */
const isValidTimestamp = value => value === null || (Number.isSafeInteger(value) && value >= 0);

const isValidCriticality = value =>
  Number.isInteger(value) && value >= CRITICALITY.min && value <= CRITICALITY.max;

/**
 * Validates a tab (a named group of lists). Its position is not part of the
 * tab itself: it comes from the order of the tabs array.
 * @param {object} input Raw tab from the client.
 * @param {number} [now] Timestamp used for missing dates.
 */
function normalizeTab(input, now = Date.now()) {
  if (!input || !isSafeId(input.id) || !isValidName(input.name, LIMITS.tabName)) {
    throw new ValidationError('Onglet invalide');
  }
  const createdAt = input.createdAt ?? now;
  if (!isValidTimestamp(createdAt)) throw new ValidationError('Date d’onglet invalide');
  return { id: input.id, name: input.name.trim(), createdAt };
}

/**
 * Validates a partial tab update (`PATCH /api/tabs/:id`).
 * @param {object} input Raw body: `{ name?, position? }`.
 * @param {{ id: string, name: string, createdAt: number }} existing Stored tab.
 * @returns {{ name: string, position: number | undefined }}
 *   `position` is the new index from the left (0), or `undefined` to keep it.
 */
function normalizeTabUpdate(input, existing) {
  const { name } = normalizeTab({ ...existing, name: input?.name ?? existing.name });
  const position = input?.position;
  if (position !== undefined && !(Number.isSafeInteger(position) && position >= 0)) {
    throw new ValidationError('Position d’onglet invalide');
  }
  return { name, position };
}

/**
 * @param {object} input Raw list from the client.
 * @param {number} [now] Timestamp used for missing dates.
 */
function normalizeList(input, now = Date.now()) {
  if (!input || !isSafeId(input.id) || !isSafeId(input.tabId) || !isValidName(input.name, LIMITS.listName)) {
    throw new ValidationError('Liste invalide');
  }
  const createdAt = input.createdAt ?? now;
  const archivedAt = input.archivedAt ?? null;
  if (!isValidTimestamp(createdAt) || !isValidTimestamp(archivedAt)) {
    throw new ValidationError('Dates de liste invalides');
  }
  return {
    id: input.id,
    tabId: input.tabId,
    name: input.name.trim(),
    archived: Boolean(input.archived),
    archivedAt,
    createdAt
  };
}

/**
 * @param {object} input Raw task from the client.
 * @param {number} [now] Timestamp used for missing dates.
 */
function normalizeTask(input, now = Date.now()) {
  const description = input?.description ?? '';
  const valid = input
    && isSafeId(input.id)
    && isSafeId(input.listId)
    && isValidName(input.name, LIMITS.taskName)
    && typeof description === 'string'
    && description.length <= LIMITS.taskDescription
    && DURATIONS.has(input.duration)
    && isValidCriticality(input.criticality)
    && STATUSES.has(input.status);
  if (!valid) throw new ValidationError('Tâche invalide');

  const createdAt = input.createdAt ?? now;
  // Only finished tasks carry a completion date.
  const completedAt = input.status === 'done' ? (input.completedAt ?? now) : null;
  if (!isValidTimestamp(createdAt) || !isValidTimestamp(completedAt)) {
    throw new ValidationError('Dates de tâche invalides');
  }
  return {
    id: input.id,
    listId: input.listId,
    name: input.name.trim(),
    description,
    duration: input.duration,
    criticality: input.criticality,
    status: input.status,
    createdAt,
    completedAt
  };
}

/**
 * Validates the registration form.
 * @returns {{ username: string, password: string }}
 */
function validateRegistration(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = body?.password;
  if (!USERNAME_PATTERN.test(username)) {
    throw new ValidationError('Identifiant : 3 à 32 caractères (lettres, chiffres, . _ -).');
  }
  if (typeof password !== 'string'
      || password.length < LIMITS.passwordMinLength
      || Buffer.byteLength(password) > LIMITS.passwordMaxBytes) {
    throw new ValidationError('Le mot de passe doit contenir au moins 12 caractères (256 octets maximum).');
  }
  return { username, password };
}

/**
 * Light check of login credentials: returns `null` when they cannot possibly
 * be valid, so the caller can answer with a generic error.
 * @returns {{ username: string, password: string } | null}
 */
function parseLogin(body) {
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = body?.password;
  if (!username || typeof password !== 'string' || password.length > LIMITS.passwordMaxBytes) return null;
  return { username, password };
}

/**
 * Validates a full board snapshot (`PUT /api/state`): every item must be
 * valid, ids unique, each list must belong to one of the tabs and each task
 * to one of the lists. An account always keeps at least one tab.
 * @returns {{ tabs: object[], lists: object[], tasks: object[], revision: number }}
 *   Tabs come back in the order received, which is their display order.
 */
function validateBoardSnapshot(body, now = Date.now()) {
  const { tabs, lists, tasks, revision } = body || {};
  if (!Array.isArray(tabs) || !Array.isArray(lists) || !Array.isArray(tasks)
      || tabs.length < 1 || tabs.length > LIMITS.maxTabs
      || lists.length > LIMITS.maxLists || tasks.length > LIMITS.maxTasks
      || !Number.isSafeInteger(revision) || revision < 0) {
    throw new ValidationError('Données invalides ou trop volumineuses.');
  }
  const cleanTabs = tabs.map(tab => normalizeTab(tab, now));
  const cleanLists = lists.map(list => normalizeList(list, now));
  const cleanTasks = tasks.map(task => normalizeTask(task, now));

  const tabIds = new Set(cleanTabs.map(t => t.id));
  const listIds = new Set(cleanLists.map(l => l.id));
  const taskIds = new Set(cleanTasks.map(t => t.id));
  if (tabIds.size !== cleanTabs.length
      || listIds.size !== cleanLists.length
      || taskIds.size !== cleanTasks.length
      || cleanLists.some(l => !tabIds.has(l.tabId))
      || cleanTasks.some(t => !listIds.has(t.listId))) {
    throw new ValidationError('Identifiants, onglets ou listes invalides.');
  }
  return { tabs: cleanTabs, lists: cleanLists, tasks: cleanTasks, revision };
}

module.exports = {
  LIMITS,
  DEFAULT_TAB_NAME,
  normalizeTab,
  normalizeTabUpdate,
  normalizeList,
  normalizeTask,
  validateRegistration,
  parseLogin,
  validateBoardSnapshot
};
