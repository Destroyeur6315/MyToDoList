/**
 * Static reference data shared by the whole UI.
 * Keys/values must stay in sync with server-side validation (src/domain/validation.js).
 */

/** Estimated durations. `weight` is the relative effort used by the quick-win score. */
export const DURATIONS = Object.freeze([
  { key: 'min',   label: 'Quelques minutes',  short: 'qq min', weight: 1 },
  { key: 'h1',    label: "Moins d'une heure", short: '< 1 h',  weight: 2 },
  { key: 'hours', label: 'Quelques heures',   short: 'qq h',   weight: 3 },
  { key: 'h12',   label: 'Moins de 12 h',     short: '< 12 h', weight: 5 },
  { key: 'h24',   label: 'Moins de 24 h',     short: '< 24 h', weight: 7 },
  { key: 'days',  label: 'Quelques jours',    short: 'qq j',   weight: 11 },
  { key: 'week',  label: 'Une semaine',       short: '1 sem.', weight: 16 },
  { key: 'week2', label: 'Deux semaines',     short: '2 sem.', weight: 24 },
  { key: 'month', label: 'Un mois',           short: '1 mois', weight: 40 }
]);

/** Criticality levels, 1 = most critical. `chip`/`dot` are Tailwind classes. */
export const CRITICALITIES = Object.freeze([
  { value: 1, label: 'Critique', chip: 'text-rose-600 bg-rose-500/12 ring-rose-500/25',   dot: 'bg-rose-500' },
  { value: 2, label: 'Élevée',   chip: 'text-amber-600 bg-amber-500/12 ring-amber-500/25', dot: 'bg-amber-500' },
  { value: 3, label: 'Moyenne',  chip: 'text-sky-600 bg-sky-500/12 ring-sky-500/25',       dot: 'bg-sky-500' },
  { value: 4, label: 'Basse',    chip: 'text-muted bg-muted/12 ring-muted/25',             dot: 'bg-muted' }
]);

export const STATUSES = Object.freeze([
  { key: 'todo',  label: 'À faire' },
  { key: 'doing', label: 'En cours' },
  { key: 'done',  label: 'Terminée' }
]);

/** Status filters of the board ("all" + one per status). */
export const FILTERS = Object.freeze([
  { key: 'all',   label: 'Tout' },
  { key: 'todo',  label: 'À faire' },
  { key: 'doing', label: 'En cours' },
  { key: 'done',  label: 'Terminées' }
]);

export const DEFAULT_DURATION = 'h1';
export const DEFAULT_CRITICALITY = 3;

/** Tabs: name of the first tab, and limits (same as src/domain/validation.js). */
export const DEFAULT_TAB_NAME = 'Mes listes';
export const MAX_TABS = 20;
export const TAB_NAME_MAX_LENGTH = 40;

/** Minimum score for a task to be shown as a quick win. */
export const QUICK_WIN_THRESHOLD = 30;
export const MAX_QUICK_WINS = 4;

/** localStorage keys (device-local display preferences only, never board data). */
export const STORAGE_KEYS = Object.freeze({
  theme: 'mytodolist.theme.v1',
  maskedLists: 'mytodolist.masked.v1'
});

/** Delay between automatic retries of pending saves. */
export const SAVE_RETRY_INTERVAL_MS = 15_000;

/**
 * While the user is active, the session is refreshed on the server at most
 * this often (the server ends sessions after 30 min without any request).
 */
export const SESSION_HEARTBEAT_INTERVAL_MS = 60_000;
/** How often the UI checks whether the session has expired. */
export const SESSION_CHECK_INTERVAL_MS = 10_000;

/** @returns {typeof DURATIONS[number]} The duration for `key` (first one if unknown). */
export const durationOf = key => DURATIONS.find(d => d.key === key) || DURATIONS[0];

/** @returns {typeof CRITICALITIES[number]} The criticality for `value` ("Moyenne" if unknown). */
export const criticalityOf = value => CRITICALITIES.find(c => c.value === Number(value)) || CRITICALITIES[2];
