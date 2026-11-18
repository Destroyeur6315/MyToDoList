/**
 * Small, dependency-free helpers.
 */

/** Shorthand for `document.getElementById`. */
export const byId = id => document.getElementById(id);

/**
 * Random 128-bit hex id. Uses `crypto.getRandomValues`, which (unlike
 * `crypto.randomUUID`) also works on plain-HTTP origins.
 */
export function createId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text before inserting it into HTML strings (prevents XSS). */
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => HTML_ENTITIES[c]);

export const formatDate = timestamp =>
  new Date(timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** `plural(2, 'liste')` → "2 listes". */
export const plural = (count, singular, pluralForm) =>
  `${count} ${count > 1 ? (pluralForm || singular + 's') : singular}`;

/** Safe localStorage read (storage may be disabled or full). */
export function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences are best-effort: ignore quota / privacy-mode errors.
  }
}

export function readStorageJson(key) {
  try {
    return JSON.parse(readStorage(key));
  } catch {
    return null;
  }
}
