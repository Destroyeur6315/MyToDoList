/**
 * Dialogs: task form, list form, tab form, tab manager and confirmation.
 */

import {
  CRITICALITIES, DEFAULT_CRITICALITY, DEFAULT_DURATION, DURATIONS, MAX_TABS, QUICK_WIN_THRESHOLD, STATUSES,
  TAB_NAME_MAX_LENGTH
} from '../constants.js';
import { activeLists, findTab, quickWinScore, setTaskStatus, state } from '../state.js';
import { persist } from '../sync.js';
import { cleanTabName } from '../tabs.js';
import { byId, createId, escapeHtml } from '../utils.js';
import { tabManagerRow } from './components.js';
import { ICONS, svgIcon } from './icons.js';
import { render, revealActiveTab } from './render.js';
import { toast } from './toast.js';

const MODAL_IDS = ['taskModal', 'listModal', 'tabModal', 'tabsModal', 'confirmModal'];
/** Lets the opening transition start before moving focus. */
const FOCUS_DELAY_MS = 60;

/** Element focused before a modal opened, restored on close. */
let previousFocus = null;
/** @type {import('../state.js').Task | null} */
let editingTask = null;
/** @type {import('../state.js').List | null} */
let editingList = null;
/** @type {import('../state.js').Tab | null} */
let editingTab = null;
/** The tab form was opened from the tab manager, which reopens once it is done. */
let tabFormFromManager = false;
/** @type {(() => void) | null} */
let pendingConfirm = null;

/** Values of the segmented controls of the task form. */
const taskForm = { criticality: DEFAULT_CRITICALITY, status: 'todo' };

/* ───────── Generic modal handling ───────── */

function openModal(id, focusId) {
  previousFocus = document.activeElement;
  byId(id).classList.remove('modal-hidden');
  document.body.style.overflow = 'hidden';
  if (focusId) setTimeout(() => byId(focusId).focus(), FOCUS_DELAY_MS);
}

export function closeModals() {
  const wasOpen = MODAL_IDS.some(id => !byId(id).classList.contains('modal-hidden'));
  MODAL_IDS.forEach(id => byId(id).classList.add('modal-hidden'));
  document.body.style.overflow = '';
  pendingConfirm = null;
  if (wasOpen && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  previousFocus = null;
}

/**
 * Asks for confirmation before a destructive action.
 * @param {{ title: string, message: string, confirmLabel: string, onConfirm: () => void }} options
 */
export function askConfirm({ title, message, confirmLabel, onConfirm }) {
  byId('cTitle').textContent = title;
  byId('cBody').textContent = message;
  byId('cOk').textContent = confirmLabel;
  pendingConfirm = onConfirm;
  openModal('confirmModal', 'cOk');
}

/* ───────── Task form ───────── */

/**
 * Renders a row of toggle buttons (criticality / status).
 * @param {HTMLElement} container
 * @param {{ value: string|number, label: string }[]} options
 * @param {string|number} selected
 * @param {(value: string) => void} onSelect
 */
function renderSegments(container, options, selected, onSelect) {
  container.innerHTML = options.map(({ value, label }) => {
    const active = String(value) === String(selected);
    const tone = active ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-canvas text-muted hover:text-ink';
    return `<button type="button" data-value="${value}" aria-pressed="${active}"`
      + ` class="h-10 rounded-xl border text-[12.5px] font-medium transition ${tone}">${label}</button>`;
  }).join('');
  container.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => onSelect(button.dataset.value));
  });
}

function renderTaskSegments() {
  renderSegments(byId('tCrit'), CRITICALITIES, taskForm.criticality, value => {
    taskForm.criticality = Number(value);
    renderTaskSegments();
    renderQuickWinHint();
  });
  renderSegments(byId('tStatus'), STATUSES.map(s => ({ value: s.key, label: s.label })), taskForm.status, value => {
    taskForm.status = value;
    renderTaskSegments();
  });
}

/** Tells the user, while filling the form, that the task will be a quick win. */
function renderQuickWinHint() {
  const hint = byId('tHint');
  const score = quickWinScore({ criticality: taskForm.criticality, duration: byId('tDur').value });
  if (score < QUICK_WIN_THRESHOLD) {
    hint.className = 'hidden';
    return;
  }
  hint.className = 'flex items-start gap-2 rounded-xl bg-accent/15 p-3 text-[12.5px] leading-snug text-ink';
  hint.innerHTML = svgIcon(ICONS.bolt, 14, 'mt-0.5 shrink-0')
    + `<span>Quick win (score ${score}) : courte et à fort impact, elle sera mise en avant dans « À faire maintenant ».</span>`;
}

/**
 * Opens the task form, empty (creation) or pre-filled (edition).
 * @param {{ listId?: string, task?: import('../state.js').Task }} [options]
 */
export function openTaskModal({ listId, task } = {}) {
  const lists = activeLists();
  if (!lists.length) {
    toast('Créez d’abord une liste');
    openListModal();
    return;
  }
  editingTask = task || null;

  byId('tList').innerHTML = lists.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join('');
  byId('tDur').innerHTML = DURATIONS.map(d => `<option value="${d.key}">${d.label}</option>`).join('');

  byId('taskModalTitle').textContent = task ? 'Modifier la tâche' : 'Nouvelle tâche';
  byId('tSubmit').textContent = task ? 'Enregistrer' : 'Ajouter la tâche';
  byId('tName').value = task?.name ?? '';
  byId('tDesc').value = task?.description ?? '';
  byId('tList').value = task?.listId ?? listId ?? lists[0].id;
  byId('tDur').value = task?.duration ?? DEFAULT_DURATION;
  taskForm.criticality = task ? Number(task.criticality) : DEFAULT_CRITICALITY;
  taskForm.status = task?.status ?? 'todo';

  renderTaskSegments();
  renderQuickWinHint();
  openModal('taskModal', 'tName');
}

function submitTaskForm(event) {
  event.preventDefault();
  const name = byId('tName').value.trim();
  if (!name) {
    byId('tName').focus();
    return;
  }
  const fields = {
    name,
    description: byId('tDesc').value.trim(),
    listId: byId('tList').value,
    duration: byId('tDur').value,
    criticality: taskForm.criticality
  };

  if (editingTask) {
    Object.assign(editingTask, fields);
    setTaskStatus(editingTask, taskForm.status);
    toast('Tâche enregistrée');
  } else {
    const task = { id: createId(), createdAt: Date.now(), completedAt: null, status: 'todo', ...fields };
    setTaskStatus(task, taskForm.status);
    state.tasks.push(task);
    // A stale search or filter must not hide the task that was just added.
    state.filter = 'all';
    state.search = '';
    byId('search').value = '';
    toast('Tâche ajoutée');
  }
  persist();
  closeModals();
  render();
}

/* ───────── List form ───────── */

/**
 * Opens the list form, empty (creation) or pre-filled (edition). With
 * several tabs, the form also lets the user pick or change the list's tab.
 */
export function openListModal(list = null) {
  editingList = list;
  byId('listModalTitle').textContent = list ? 'Modifier la liste' : 'Nouvelle liste';
  byId('lSubmit').textContent = list ? 'Enregistrer' : 'Créer la liste';
  byId('lName').value = list?.name ?? '';
  byId('lTab').innerHTML = state.tabs
    .map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
  byId('lTab').value = list?.tabId ?? state.activeTabId ?? '';
  byId('lTabField').classList.toggle('hidden', state.tabs.length < 2);
  openModal('listModal', 'lName');
}

function submitListForm(event) {
  event.preventDefault();
  const name = byId('lName').value.trim();
  if (!name) {
    byId('lName').focus();
    return;
  }
  const tab = findTab(byId('lTab').value) || findTab(state.activeTabId);
  if (editingList) {
    const moved = editingList.tabId !== tab.id;
    editingList.name = name;
    editingList.tabId = tab.id;
    toast(moved ? `Liste déplacée dans « ${tab.name} »` : 'Liste enregistrée');
  } else {
    state.lists.unshift({ id: createId(), tabId: tab.id, name, archived: false, archivedAt: null, createdAt: Date.now() });
    // Show the tab that received the new list.
    state.activeTabId = tab.id;
    toast('Liste créée');
  }
  persist();
  closeModals();
  render();
  revealActiveTab();
}

/* ───────── Tab form ───────── */

/**
 * Opens the tab form, empty (creation) or pre-filled (rename).
 * @param {{ tab?: import('../state.js').Tab | null, fromManager?: boolean }} [options]
 */
export function openTabModal({ tab = null, fromManager = false } = {}) {
  if (!tab && state.tabs.length >= MAX_TABS) {
    toast(`Limite de ${MAX_TABS} onglets atteinte`);
    return;
  }
  closeModals();
  editingTab = tab;
  tabFormFromManager = fromManager;
  byId('tabModalTitle').textContent = tab ? 'Renommer l’onglet' : 'Nouvel onglet';
  byId('tabSubmit').textContent = tab ? 'Enregistrer' : 'Créer l’onglet';
  byId('tabName').value = tab?.name ?? '';
  openModal('tabModal', 'tabName');
}

function submitTabForm(event) {
  event.preventDefault();
  const name = cleanTabName(byId('tabName').value, TAB_NAME_MAX_LENGTH);
  if (!name) {
    byId('tabName').focus();
    return;
  }
  if (editingTab) {
    editingTab.name = name;
    toast('Onglet renommé');
  } else {
    const tab = { id: createId(), name, createdAt: Date.now() };
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    state.view = 'board';
    toast('Onglet créé');
  }
  const reopenManager = tabFormFromManager;
  persist();
  closeModals();
  render();
  revealActiveTab();
  if (reopenManager) openTabsModal();
}

/* ───────── Tab manager ───────── */

/** Re-renders the rows of the tab manager (after a rename, move or delete). */
export function renderTabManager() {
  byId('tabsManager').innerHTML = state.tabs.map((tab, index) => tabManagerRow(tab, index)).join('');
}

export function openTabsModal() {
  closeModals();
  renderTabManager();
  openModal('tabsModal');
}

/** Whether the tab manager is currently open. */
export const isTabsModalOpen = () => !byId('tabsModal').classList.contains('modal-hidden');

/* ───────── Wiring ───────── */

/** Attaches the dialog event listeners (call once at startup). */
export function initModals() {
  byId('taskForm').addEventListener('submit', submitTaskForm);
  byId('listForm').addEventListener('submit', submitListForm);
  byId('tabForm').addEventListener('submit', submitTabForm);
  byId('tDur').addEventListener('change', renderQuickWinHint);

  byId('cOk').addEventListener('click', () => {
    const confirmed = pendingConfirm;
    closeModals();
    confirmed?.();
  });

  // Clicking the backdrop (outside the sheet) closes the dialog.
  MODAL_IDS.forEach(id => {
    const backdrop = byId(id);
    backdrop.addEventListener('mousedown', event => {
      if (event.target === backdrop) closeModals();
    });
  });
}
