/**
 * In-memory application state and the pure queries built on top of it.
 * Rendering reads from here; actions mutate it then call `persist()`.
 */

import { QUICK_WIN_THRESHOLD, MAX_QUICK_WINS, STORAGE_KEYS } from './constants.js';
import { normalizeTabs, tabAfterRemoval } from './tabs.js';
import { hasManualOrder, insertTask, isAutomaticOrder, quickWinScore, sortTasks } from './taskOrder.js';
import { readStorageJson, writeStorage } from './utils.js';

/**
 * @typedef {import('./tabs.js').Tab} Tab
 * @typedef {{ id: string, tabId: string, name: string, archived: boolean, archivedAt: number|null,
 *   createdAt: number }} List
 * @typedef {{ id: string, listId: string, name: string, description: string, duration: string,
 *   criticality: number, status: 'todo'|'doing'|'done', position: number|null, createdAt: number, completedAt: number|null }} Task
 */

export const state = {
  /** Display order, leftmost first. @type {Tab[]} */
  tabs: [],
  /** Tab whose lists the board shows. @type {string | null} */
  activeTabId: null,
  /** @type {List[]} */
  lists: [],
  /** @type {Task[]} */
  tasks: [],
  /** Current view: 'board' | 'history'. */
  view: 'board',
  /** Status filter: 'all' | 'todo' | 'doing' | 'done'. */
  filter: 'all',
  search: '',
  updatedAt: 0
};

/**
 * Replaces the board data (after loading from the server, logout, import…)
 * and shows the leftmost tab.
 */
export function replaceBoard({ tabs, lists, tasks, updatedAt } = {}) {
  state.tabs = normalizeTabs(tabs);
  state.activeTabId = state.tabs[0]?.id ?? null;
  state.lists = Array.isArray(lists) ? lists : [];
  state.tasks = Array.isArray(tasks) ? tasks : [];
  state.updatedAt = updatedAt || 0;
}

export function resetViewFilters() {
  state.view = 'board';
  state.filter = 'all';
  state.search = '';
}

/* ───────── Lookups ───────── */

export const findTab = id => state.tabs.find(t => t.id === id);
export const findList = id => state.lists.find(l => l.id === id);
export const findTask = id => state.tasks.find(t => t.id === id);
export const tasksOf = listId => state.tasks.filter(t => t.listId === listId);
/** Every list of a tab, archived ones included. */
export const listsOfTab = tabId => state.lists.filter(l => l.tabId === tabId);
/** Non-archived lists of the active tab: the lists shown on the board. */
export const activeLists = () => state.lists.filter(l => !l.archived && l.tabId === state.activeTabId);
export const archivedLists = () => state.lists
  .filter(l => l.archived)
  .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));

/** Tasks belonging to the non-archived lists of the active tab. */
export function activeTasks() {
  const ids = new Set(activeLists().map(l => l.id));
  return state.tasks.filter(t => ids.has(t.listId));
}

/* ───────── Mutations ───────── */

/**
 * Removes a tab with all of its lists (archived ones included) and their
 * tasks. If it was the active tab, a neighbouring tab becomes active.
 */
export function deleteTab(tabId) {
  const listIds = new Set(listsOfTab(tabId).map(l => l.id));
  state.activeTabId = tabAfterRemoval(state.tabs, tabId, state.activeTabId);
  state.tabs = state.tabs.filter(t => t.id !== tabId);
  state.lists = state.lists.filter(l => !listIds.has(l.id));
  state.tasks = state.tasks.filter(t => !listIds.has(t.listId));
}

/** Removes a list and all of its tasks. */
export function deleteList(listId) {
  state.lists = state.lists.filter(l => l.id !== listId);
  state.tasks = state.tasks.filter(t => t.listId !== listId);
}

export function deleteTask(taskId) {
  state.tasks = state.tasks.filter(t => t.id !== taskId);
}

/**
 * Changes the list of a task and lets that list decide of its place: sorted
 * automatically, or last if the list is ordered by hand.
 */
export function setTaskList(task, listId) {
  if (task.listId === listId) return;
  task.listId = listId;
  task.position = null;
}

/**
 * Moves a task within its list or to another active list. The target list
 * becomes ordered by hand, unless its automatic sort gives the same order.
 * @param {string} taskId
 * @param {string} listId Target list.
 * @param {string | null} beforeId Task to insert before, `null` for the end.
 * @returns {boolean} `false` when nothing changed.
 */
export function moveTask(taskId, listId, beforeId) {
  const task = findTask(taskId);
  const list = findList(listId);
  if (!task || !list || list.archived) return false;

  const current = sortTasks(tasksOf(listId));
  const ordered = insertTask(current, task, beforeId);
  const sameList = task.listId === listId;
  if (sameList && ordered.every((t, index) => t.id === current[index].id)) return false;

  setTaskList(task, listId);
  const stored = tasksOf(listId);
  const automatic = !hasManualOrder(stored) && isAutomaticOrder(ordered, stored);
  ordered.forEach((t, index) => { t.position = automatic ? null : index; });
  return true;
}

/** Whether the tasks of a list were ordered by hand. */
export const isManuallyOrdered = listId => hasManualOrder(tasksOf(listId));

/** Goes back to the automatic sort of a list. */
export function resetTaskOrder(listId) {
  for (const task of tasksOf(listId)) task.position = null;
}

/** Sets a task's status and keeps `completedAt` consistent with it. */
export function setTaskStatus(task, status) {
  task.status = status;
  task.completedAt = status === 'done' ? (task.completedAt || Date.now()) : null;
}

/* ───────── Statistics & scoring ───────── */

export function countByStatus(tasks) {
  const counts = { todo: 0, doing: 0, done: 0 };
  for (const t of tasks) counts[t.status] += 1;
  return counts;
}

export function listStats(listId) {
  const tasks = tasksOf(listId);
  const { todo, doing, done } = countByStatus(tasks);
  const total = tasks.length;
  return {
    total, todo, doing, done,
    percent: total ? Math.round(done / total * 100) : 0,
    complete: total > 0 && done === total
  };
}

export const isQuickWin = task => task.status !== 'done' && quickWinScore(task) >= QUICK_WIN_THRESHOLD;

/** Best open quick wins, highest score first (ties: most critical first). */
export function quickWins() {
  return activeTasks()
    .filter(isQuickWin)
    .map(task => ({ task, score: quickWinScore(task) }))
    .sort((a, b) => b.score - a.score || a.task.criticality - b.task.criticality)
    .slice(0, MAX_QUICK_WINS);
}

/** Whether a task passes the current status filter and search text. */
export function matchesFilters(task) {
  if (state.filter !== 'all' && task.status !== state.filter) return false;
  const query = state.search.trim().toLowerCase();
  if (!query) return true;
  return `${task.name} ${task.description || ''}`.toLowerCase().includes(query);
}

/** Tasks of a list shown on screen, in display order. */
export const visibleTasks = listId => sortTasks(tasksOf(listId).filter(matchesFilters));

/* ───────── Masked lists (device-local display preference) ───────── */

const maskedLists = new Set(
  (list => (Array.isArray(list) ? list : []))(readStorageJson(STORAGE_KEYS.maskedLists))
);

export const isListMasked = listId => maskedLists.has(listId);

export function toggleListMask(listId) {
  if (maskedLists.has(listId)) maskedLists.delete(listId);
  else maskedLists.add(listId);
  writeStorage(STORAGE_KEYS.maskedLists, JSON.stringify([...maskedLists]));
}
