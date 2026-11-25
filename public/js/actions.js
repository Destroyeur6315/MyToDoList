/**
 * User interactions on the board: one delegated listener for every
 * `[data-action]` element, plus keyboard shortcuts and search.
 */

import { DEFAULT_TAB_NAME, TAB_NAME_MAX_LENGTH } from './constants.js';
import {
  activeLists, deleteList, deleteTab, deleteTask, findList, findTab, findTask, listsOfTab, listStats, moveTask,
  resetTaskOrder, setTaskList, setTaskStatus, state, tasksOf, toggleListMask, visibleTasks
} from './state.js';
import { persist } from './sync.js';
import { cleanTabName, moveTab } from './tabs.js';
import { stepTarget } from './taskOrder.js';
import { byId, createId, plural } from './utils.js';
import { initTaskDrag } from './ui/drag.js';
import {
  askConfirm, closeModals, isTabsModalOpen, openListModal, openTabModal, openTabsModal, openTaskModal, renderTabManager
} from './ui/modals.js';
import {
  render, renderLists, renderQuickWins, renderTabs, refreshLists, refreshTask, revealActiveTab,
  updateAllTaskScrollFades, updateTabStripFade, updateTaskScrollFade
} from './ui/render.js';
import { toggleTheme } from './ui/theme.js';
import { toast } from './ui/toast.js';

/** Saves, re-renders everything and confirms with a toast. */
function commit(message) {
  persist();
  render();
  if (message) toast(message);
}

/* ───────── Task actions ───────── */

function toggleTaskProgress(id) {
  const task = findTask(id);
  if (!task || task.status === 'done') return;
  setTaskStatus(task, task.status === 'doing' ? 'todo' : 'doing');
  persist();
  refreshTask(id);
}

function toggleTaskDone(id) {
  const task = findTask(id);
  if (!task) return;
  setTaskStatus(task, task.status === 'done' ? 'todo' : 'done');
  persist();
  refreshTask(id);
  if (task.status === 'done') {
    toast(listStats(task.listId).complete ? 'Liste terminée, rangez-la dans l’historique' : 'Tâche terminée');
  }
}

function confirmDeleteTask(id) {
  const task = findTask(id);
  if (!task) return;
  askConfirm({
    title: 'Supprimer la tâche',
    message: `« ${task.name} » sera définitivement supprimée.`,
    confirmLabel: 'Supprimer',
    onConfirm: () => { deleteTask(id); commit('Tâche supprimée'); }
  });
}

/* ───────── Moving tasks ───────── */

/** Saves and shows a move from the list `fromId`. */
function commitTaskMove(task, fromId) {
  persist();
  refreshLists([fromId, task.listId]);
  if (task.listId !== fromId) toast(`Tâche déplacée dans « ${findList(task.listId).name} »`);
}

/** A task was dropped on the board (drag and drop). */
function dropTask(id, { listId, beforeId }) {
  const task = findTask(id);
  const fromId = task?.listId;
  if (moveTask(id, listId, beforeId)) commitTaskMove(task, fromId);
}

/** Opens the tab a dragged task is held over, so that it can be dropped in one of its lists. */
function openTabDuringDrag(id) {
  if (!findTab(id) || id === state.activeTabId) return;
  state.activeTabId = id;
  render();
}

function focusDragHandle(id) {
  const handle = document.querySelector(`#lists [data-drag-handle][data-id="${CSS.escape(id)}"]`);
  handle?.focus();
  handle?.scrollIntoView?.({ block: 'nearest' });
}

/** Moves a task one step up (-1) or down (1) among the tasks on screen. */
function stepTask(task, offset) {
  const target = stepTarget(visibleTasks(task.listId), task.id, offset);
  if (!target || !moveTask(task.id, task.listId, target.beforeId)) return;
  commitTaskMove(task, task.listId);
  const visible = visibleTasks(task.listId);
  toast(`Position ${visible.indexOf(task) + 1} sur ${visible.length}`);
}

/** Moves a task to the previous (-1) or next (1) list of the tab. */
function sendTaskToList(task, offset) {
  const lists = activeLists();
  const fromId = task.listId;
  const target = lists[lists.findIndex(l => l.id === fromId) + offset];
  if (!target) return;
  setTaskList(task, target.id);
  commitTaskMove(task, fromId);
}

/** Arrow keys on a focused drag handle. */
const HANDLE_KEYS = {
  ArrowUp: task => stepTask(task, -1),
  ArrowDown: task => stepTask(task, 1),
  ArrowLeft: task => sendTaskToList(task, -1),
  ArrowRight: task => sendTaskToList(task, 1)
};

function onHandleKeyDown(event) {
  const handle = event.target.closest?.('[data-drag-handle]');
  const move = HANDLE_KEYS[event.key];
  const task = handle && move && findTask(handle.dataset.id);
  if (!task || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  event.preventDefault();
  move(task);
  // The card was rebuilt: keep the focus on the task that moved.
  focusDragHandle(task.id);
}

function restoreAutomaticSort(id) {
  resetTaskOrder(id);
  persist();
  refreshLists([id]);
  toast('Tri automatique rétabli');
}

/* ───────── List actions ───────── */

function confirmDeleteList(id) {
  const list = findList(id);
  if (!list) return;
  askConfirm({
    title: 'Supprimer la liste',
    message: `« ${list.name} » et ses ${plural(tasksOf(id).length, 'tâche')} seront définitivement supprimées.`,
    confirmLabel: 'Supprimer',
    onConfirm: () => { deleteList(id); commit('Liste supprimée'); }
  });
}

function confirmPurgeList(id) {
  const list = findList(id);
  if (!list) return;
  askConfirm({
    title: 'Supprimer de l’historique',
    message: `« ${list.name} » disparaîtra définitivement.`,
    confirmLabel: 'Supprimer',
    onConfirm: () => { deleteList(id); commit('Liste supprimée'); }
  });
}

function archiveList(id) {
  const list = findList(id);
  if (!list) return;
  list.archived = true;
  list.archivedAt = Date.now();
  commit('Liste rangée dans l’historique');
}

function restoreList(id) {
  const list = findList(id);
  if (!list) return;
  list.archived = false;
  list.archivedAt = null;
  commit('Liste restaurée');
}

function toggleMask(id) {
  toggleListMask(id);
  renderQuickWins();
  renderLists();
}

function confirmResetAll() {
  askConfirm({
    title: 'Tout effacer',
    message: 'Onglets, listes, tâches et historique seront remis à zéro.',
    confirmLabel: 'Tout effacer',
    onConfirm: () => {
      // An account always keeps one tab.
      const tab = { id: createId(), name: DEFAULT_TAB_NAME, createdAt: Date.now() };
      state.tabs = [tab];
      state.activeTabId = tab.id;
      state.lists = [];
      state.tasks = [];
      commit('Données effacées');
    }
  });
}

/* ───────── Tab actions ───────── */

function showTab(id) {
  if (!findTab(id)) return;
  state.activeTabId = id;
  state.view = 'board';
  render();
  revealActiveTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Moves a tab one step left (-1) or right (1), keeping keyboard focus on the same button. */
function shiftTab(id, offset) {
  state.tabs = moveTab(state.tabs, id, offset);
  persist();
  renderTabs();
  renderTabManager();
  const selector = `#tabsManager [data-action="move-tab"][data-id="${CSS.escape(id)}"]`;
  const buttons = [...document.querySelectorAll(selector)];
  // At either end the pressed button becomes disabled: focus the other one.
  const target = buttons.find(b => Number(b.dataset.offset) === offset && !b.disabled) || buttons.find(b => !b.disabled);
  target?.focus();
}

/** Inline rename from the tab manager (fires on Enter or when the field loses focus). */
function renameTab(input) {
  const tab = findTab(input.dataset.id);
  if (!tab) return;
  const name = cleanTabName(input.value, TAB_NAME_MAX_LENGTH);
  if (!name) {
    input.value = tab.name;
    toast('Le nom de l’onglet ne peut pas être vide');
    return;
  }
  input.value = name;
  if (name === tab.name) return;
  tab.name = name;
  persist();
  renderTabs();
  toast('Onglet renommé');
}

/** Deletes a tab right away when it is empty, after confirmation otherwise. */
function confirmDeleteTab(id) {
  const tab = findTab(id);
  if (!tab || state.tabs.length < 2) return;
  const lists = listsOfTab(id);
  const remove = () => {
    deleteTab(id);
    persist();
    render();
    revealActiveTab();
    toast('Onglet supprimé');
  };
  if (!lists.length) {
    remove();
    if (isTabsModalOpen()) renderTabManager();
    return;
  }
  const tasks = lists.reduce((sum, list) => sum + tasksOf(list.id).length, 0);
  askConfirm({
    title: 'Supprimer l’onglet',
    message: `« ${tab.name} » sera supprimé avec ses ${plural(lists.length, 'liste')} et ${plural(tasks, 'tâche')}`
      + ', historique compris. Cette action est définitive.',
    confirmLabel: 'Supprimer',
    onConfirm: () => {
      remove();
      openTabsModal();
    }
  });
}

/* ───────── Navigation ───────── */

function showView(view) {
  state.view = view;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setFilter(filter) {
  state.filter = filter;
  render();
}

/**
 * Handlers by `data-action` name. Each receives the element's `data-id`
 * and the element itself.
 * @type {Record<string, (id: string, element: HTMLElement) => void>}
 */
const CLICK_ACTIONS = {
  'view': (id, el) => showView(el.dataset.view),
  'filter': (id, el) => setFilter(el.dataset.key),
  'toggle-theme': () => toggleTheme(),
  'reset-all': () => confirmResetAll(),
  'close-modal': () => closeModals(),

  'tab': id => showTab(id),
  'new-tab': () => openTabModal({ fromManager: isTabsModalOpen() }),
  'manage-tabs': () => openTabsModal(),
  'move-tab': (id, el) => shiftTab(id, Number(el.dataset.offset)),
  'del-tab': id => confirmDeleteTab(id),

  'new-list': () => openListModal(),
  'edit-list': id => openListModal(findList(id)),
  'auto-sort': id => restoreAutomaticSort(id),
  'mask-list': id => toggleMask(id),
  'del-list': id => confirmDeleteList(id),
  'restore': id => restoreList(id),
  'purge': id => confirmPurgeList(id),

  'new-task': id => openTaskModal({ listId: id }),
  'edit-task': id => openTaskModal({ task: findTask(id) }),
  'del-task': id => confirmDeleteTask(id),
  'toggle-progress': id => toggleTaskProgress(id),
  'toggle-done': id => toggleTaskDone(id),
  'toggle-desc': (id, el) => {
    el.classList.toggle('line-clamp-2');
    // The task got taller or shorter: the list may now (no longer) overflow.
    updateTaskScrollFade(el.closest('[data-task-scroll]'));
  }
};

function onClick(event) {
  const element = event.target.closest('[data-action]');
  const handler = element && CLICK_ACTIONS[element.dataset.action];
  if (handler) handler(element.dataset.id, element);
}

/** The "archive" checkbox and the tab name fields react to `change`, not `click`. */
function onChange(event) {
  const element = event.target.closest('[data-action="archive"], [data-action="rename-tab"]');
  if (element?.dataset.action === 'archive') archiveList(element.dataset.id);
  if (element?.dataset.action === 'rename-tab') renameTab(element);
}

/** Double-clicking a header tab renames it. */
function onDoubleClick(event) {
  const element = event.target.closest('[data-action="tab"]');
  const tab = element && findTab(element.dataset.id);
  if (tab) openTabModal({ tab });
}

function onKeyDown(event) {
  onHandleKeyDown(event);
  if (event.key === 'Escape') closeModals();
  // Ctrl/Cmd + N: new task.
  if (event.key.toLowerCase() === 'n' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    openTaskModal();
  }
}

/** Attaches the global listeners (call once at startup). */
export function initActions() {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('dblclick', onDoubleClick);
  byId('tabBar').addEventListener('scroll', updateTabStripFade, { passive: true });
  // `scroll` does not bubble: listen in the capture phase for every task list.
  document.addEventListener('scroll', event => {
    if (event.target instanceof Element && event.target.matches('[data-task-scroll]')) updateTaskScrollFade(event.target);
  }, { capture: true, passive: true });
  window.addEventListener('resize', () => {
    updateTabStripFade();
    updateAllTaskScrollFades();
  });
  document.addEventListener('keydown', onKeyDown);
  initTaskDrag({ onDrop: dropTask, onTabHover: openTabDuringDrag });

  const search = byId('search');
  search.addEventListener('input', () => {
    state.search = search.value;
    renderLists();
  });
}
