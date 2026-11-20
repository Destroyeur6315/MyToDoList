/**
 * Pure helpers for tabs (named groups of lists). No DOM and no shared state:
 * they take arrays and return new values, so they are unit tested with
 * `node --test` (tests/tabs.test.js).
 *
 * The order of the tabs array is the display order: index 0 is the leftmost
 * tab, the one shown when the application opens.
 */

/**
 * @typedef {{ id: string, name: string, createdAt: number }} Tab
 */

/**
 * Sorts tabs received from the server by position and keeps only the fields
 * the client works with (the position becomes the array index).
 * @param {unknown} tabs
 * @returns {Tab[]}
 */
export function normalizeTabs(tabs) {
  if (!Array.isArray(tabs)) return [];
  return tabs
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .map(({ id, name, createdAt }) => ({ id, name, createdAt }));
}

/**
 * Moves a tab by `offset` places (-1: one step left, 1: one step right).
 * Moves past either end are ignored.
 * @param {Tab[]} tabs
 * @param {string} id
 * @param {number} offset
 * @returns {Tab[]} A new array (the same order if the move is impossible).
 */
export function moveTab(tabs, id, offset) {
  const from = tabs.findIndex(t => t.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= tabs.length) return tabs.slice();
  const result = tabs.slice();
  const [tab] = result.splice(from, 1);
  result.splice(to, 0, tab);
  return result;
}

/**
 * Tab to show once `removedId` is deleted: the active tab if it survives,
 * otherwise its right-hand neighbour, or the left-hand one for the last tab.
 * @param {Tab[]} tabs Tabs before the deletion.
 * @param {string} removedId
 * @param {string | null} activeId
 * @returns {string | null} `null` when no tab is left.
 */
export function tabAfterRemoval(tabs, removedId, activeId) {
  const remaining = tabs.filter(t => t.id !== removedId);
  if (!remaining.length) return null;
  if (activeId !== removedId && remaining.some(t => t.id === activeId)) return activeId;
  const index = tabs.findIndex(t => t.id === removedId);
  return remaining[Math.min(Math.max(index, 0), remaining.length - 1)].id;
}

/**
 * Cleans a tab name typed by the user.
 * @param {unknown} value
 * @param {number} maxLength
 * @returns {string | null} The trimmed name, or `null` if blank or too long.
 */
export function cleanTabName(value, maxLength) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && name.length <= maxLength ? name : null;
}
