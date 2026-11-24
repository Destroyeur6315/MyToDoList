/**
 * User interactions on the board: one delegated listener for every
 * `[data-action]` element, plus keyboard shortcuts and search.
 */

import { DEFAULT_TAB_NAME, TAB_NAME_MAX_LENGTH } from './constants.js';
import {
  deleteList, deleteTab, deleteTask, findList, findTab, findTask, listsOfTab, listStats, setTaskStatus, state,
  tasksOf, toggleListMask
} from './state.js';
import { persist } from './sync.js';
import { cleanTabName, moveTab } from './tabs.js';
import { byId, createId, plural } from './utils.js';
import {
  askConfirm, closeModals, isTabsModalOpen, openListModal, openTabModal, openTabsModal, openTaskModal, renderTabManager
} from './ui/modals.js';
import {
  render, renderLists, renderQuickWins, renderTabs, refreshTask, revealActiveTab, updateAllTaskScrollFades,
  updateTabStripFade, updateTaskScrollFade
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

  const search = byId('search');
  search.addEventListener('input', () => {
    state.search = search.value;
    renderLists();
  });
}
