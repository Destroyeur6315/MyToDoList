/**
 * User interactions on the board: one delegated listener for every
 * `[data-action]` element, plus keyboard shortcuts and search.
 */

import {
  deleteList, deleteTask, findList, findTask, listStats, setTaskStatus, state, tasksOf, toggleListMask
} from './state.js';
import { persist } from './sync.js';
import { byId, plural } from './utils.js';
import { askConfirm, closeModals, openListModal, openTaskModal } from './ui/modals.js';
import { render, renderLists, renderQuickWins, refreshTask } from './ui/render.js';
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
    message: 'Listes, tâches et historique seront remis à zéro.',
    confirmLabel: 'Tout effacer',
    onConfirm: () => {
      state.lists = [];
      state.tasks = [];
      commit('Données effacées');
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
  'toggle-desc': (id, el) => el.classList.toggle('line-clamp-2')
};

function onClick(event) {
  const element = event.target.closest('[data-action]');
  const handler = element && CLICK_ACTIONS[element.dataset.action];
  if (handler) handler(element.dataset.id, element);
}

/** The "archive" checkbox reacts to `change`, not `click`. */
function onChange(event) {
  const element = event.target.closest('[data-action="archive"]');
  if (element) archiveList(element.dataset.id);
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
  document.addEventListener('keydown', onKeyDown);

  const search = byId('search');
  search.addEventListener('input', () => {
    state.search = search.value;
    renderLists();
  });
}
