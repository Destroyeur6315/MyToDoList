/**
 * In-memory application state and the pure queries built on top of it.
 * Rendering reads from here; actions mutate it then call `persist()`.
 */

import {
  durationOf, QUICK_WIN_THRESHOLD, MAX_QUICK_WINS, STORAGE_KEYS
} from './constants.js';
import { normalizeTabs, tabAfterRemoval } from './tabs.js';
import { readStorageJson, writeStorage } from './utils.js';

/**
 * @typedef {import('./tabs.js').Tab} Tab
 * @typedef {{ id: string, tabId: string, name: string, archived: boolean, archivedAt: number|null,
 *   createdAt: number }} List
 * @typedef {{ id: string, listId: string, name: string, description: string, duration: string,
 *   criticality: number, status: 'todo'|'doing'|'done', createdAt: number, completedAt: number|null }} Task
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

/**
 * Quick-win score: high impact for little effort.
 * Impact goes from 4 (critical) to 1 (low), divided by the duration weight.
 */
export function quickWinScore(task) {
  const impact = 5 - Number(task.criticality);
  return Math.round(impact / durationOf(task.duration).weight * 40);
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

const STATUS_RANK = { doing: 0, todo: 1, done: 2 };

/** In progress first, then to-do, then done; within a group by score then criticality. */
export const sortTasks = tasks => tasks.slice().sort((a, b) =>
  STATUS_RANK[a.status] - STATUS_RANK[b.status]
  || quickWinScore(b) - quickWinScore(a)
  || a.criticality - b.criticality);

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
