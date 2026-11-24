/**
 * Renders the application state into the page.
 */

import { FILTERS } from '../constants.js';
import {
  state, activeLists, activeTasks, archivedLists, countByStatus, findList, findTask, quickWins, tasksOf
} from '../state.js';
import { byId, plural } from '../utils.js';
import { ICONS, svgIcon } from './icons.js';
import { historyCard, listCard, quickWinCard, tabButton } from './components.js';

/** Progress ring geometry (SVG circle). */
const RING_RADIUS = 15;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function statCell(value, label, borders = '') {
  return `<div class="px-4 py-4 ${borders}">`
    + `<p class="tabular font-display text-[26px] font-semibold leading-none">${value}</p>`
    + `<p class="mt-1.5 text-[12.5px] text-muted">${label}</p></div>`;
}

function progressRing(percent) {
  const offset = (RING_CIRCUMFERENCE * (1 - percent / 100)).toFixed(1);
  return '<div class="flex items-center gap-3 px-4 py-4">'
    + '<svg width="40" height="40" viewBox="0 0 40 40" class="-rotate-90 shrink-0">'
    + `<circle cx="20" cy="20" r="${RING_RADIUS}" fill="none" stroke="rgb(var(--line))" stroke-width="4"/>`
    + `<circle cx="20" cy="20" r="${RING_RADIUS}" fill="none" stroke="rgb(var(--accent))" stroke-width="4" stroke-linecap="round"`
    + ` stroke-dasharray="${RING_CIRCUMFERENCE.toFixed(1)}" stroke-dashoffset="${offset}" style="transition:stroke-dashoffset .5s ease"/></svg>`
    + `<div><p class="tabular font-display text-[20px] font-semibold leading-none">${percent}%</p>`
    + `<p class="mt-1 text-[12.5px] text-muted">${plural(activeLists().length, 'liste')} en cours</p></div></div>`;
}

/** Counters strip at the top of the board. */
export function renderStats() {
  const tasks = activeTasks();
  const { todo, doing, done } = countByStatus(tasks);
  const percent = tasks.length ? Math.round(done / tasks.length * 100) : 0;

  // 2×2 grid on mobile (explicit borders), one row from `sm` (divide-x on the strip).
  byId('statStrip').innerHTML =
    statCell(todo, 'À faire', 'border-b border-r border-line sm:border-b-0')
    + statCell(doing, 'En cours', 'border-b border-line sm:border-b-0')
    + statCell(done, 'Terminées', 'border-r border-line')
    + progressRing(percent);
}

/** "À faire maintenant" banner. */
export function renderQuickWins() {
  const container = byId('quickWins');
  const wins = quickWins();
  if (!wins.length) {
    container.innerHTML = activeTasks().length
      ? '<div class="rounded-xl2 border border-dashed border-line px-4 py-5 text-[13px] text-muted">'
        + 'Aucun quick win disponible. Les tâches courtes et critiques apparaissent ici dès que vous en créez une.</div>'
      : '';
    return;
  }
  container.innerHTML = '<div class="rounded-xl2 bg-accent p-4 sm:p-5">'
    + '<div class="flex items-baseline justify-between gap-3">'
    + '<h2 class="font-display text-[17px] font-semibold text-accentink">À faire maintenant</h2>'
    + '<p class="text-[12px] text-accentink/75">court + important</p>'
    + '</div>'
    + '<p class="mt-1 text-[13px] leading-snug text-accentink/80">Le meilleur rapport impact / temps parmi vos tâches ouvertes.</p>'
    + `<div class="mt-3 grid gap-2 sm:grid-cols-2">${wins.map(quickWinCard).join('')}</div>`
    + '</div>';
}

export function renderFilters() {
  byId('filters').innerHTML = FILTERS.map(({ key, label }) => {
    const tone = state.filter === key ? 'bg-ink text-canvas' : 'text-muted hover:text-ink';
    return `<button type="button" data-action="filter" data-key="${key}" aria-pressed="${state.filter === key}"`
      + ` class="rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${tone}">${label}</button>`;
  }).join('');
}

/* ───────── Scrollable task lists ───────── */

/** Fades the top / bottom edge of a task list when tasks are hidden there. */
export function updateTaskScrollFade(scroller) {
  if (!scroller) return;
  const maxScroll = scroller.scrollHeight - scroller.clientHeight;
  scroller.toggleAttribute('data-fade-top', scroller.scrollTop > 1);
  scroller.toggleAttribute('data-fade-bottom', scroller.scrollTop < maxScroll - 1);
}

export function updateAllTaskScrollFades() {
  document.querySelectorAll('[data-task-scroll]').forEach(updateTaskScrollFade);
}

/**
 * Runs a re-render without losing where each task list was scrolled to:
 * cards are rebuilt from HTML strings, which would otherwise jump back to
 * the top on every checkbox click.
 * @param {() => void} update
 */
function keepTaskScroll(update) {
  const positions = new Map();
  document.querySelectorAll('[data-task-scroll]').forEach(scroller => {
    positions.set(scroller.dataset.taskScroll, scroller.scrollTop);
  });
  update();
  document.querySelectorAll('[data-task-scroll]').forEach(scroller => {
    const top = positions.get(scroller.dataset.taskScroll);
    if (top) scroller.scrollTop = top;
    updateTaskScrollFade(scroller);
  });
}

export function renderLists() {
  keepTaskScroll(renderListCards);
}

function renderListCards() {
  const container = byId('lists');
  const lists = activeLists();
  if (!lists.length) {
    container.innerHTML = '<div class="col-span-full rounded-xl2 border border-dashed border-line px-6 py-12 text-center">'
      + '<p class="font-display text-[16px] font-semibold">Commencez par une liste</p>'
      + '<p class="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted">'
      + 'Une liste regroupe les tâches d\'un projet ou d\'un domaine. Vous y ajouterez ensuite vos tâches.</p>'
      + '<button type="button" data-action="new-list" class="mt-4 inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-[14px] font-semibold text-accentink transition hover:brightness-105">'
      + `${svgIcon(ICONS.plus, 15)}Créer une liste</button></div>`;
    return;
  }
  container.innerHTML = lists.map(list => listCard(list)).join('');
}

export function renderHistory() {
  const lists = archivedLists();
  const count = lists.length;
  byId('histCount').textContent = count ? `(${count})` : '';

  const totalTasks = lists.reduce((sum, l) => sum + tasksOf(l.id).length, 0);
  const summary = count
    ? `${plural(count, 'liste')} rangée${count > 1 ? 's' : ''}, ${plural(totalTasks, 'tâche')} bouclée${totalTasks > 1 ? 's' : ''}.`
    : 'Vos listes terminées arriveront ici une fois rangées.';
  byId('historyHead').innerHTML = '<div class="rounded-xl2 border border-line bg-surface px-4 py-4">'
    + '<h2 class="font-display text-[17px] font-semibold">Historique</h2>'
    + `<p class="mt-1 text-[13px] text-muted">${summary}</p></div>`;

  keepTaskScroll(() => { byId('history').innerHTML = lists.map(list => historyCard(list)).join(''); });
}

/** Header tabs: one per tab of the account, then "Historique" on the right. */
export function renderTabs() {
  const onBoard = state.view === 'board';
  byId('tabBar').innerHTML = state.tabs
    .map(tab => tabButton(tab, onBoard && tab.id === state.activeTabId))
    .join('');

  updateTabStripFade();

  const history = byId('historyTab');
  history.setAttribute('aria-current', onBoard ? 'false' : 'page');
  history.classList.toggle('bg-surface2', !onBoard);
  history.classList.toggle('text-ink', !onBoard);
  for (const name of ['text-muted', 'hover:text-ink', 'hover:bg-surface2/60']) history.classList.toggle(name, onBoard);
}

/** Fades the edges of the tab strip that hide more tabs (see `.tab-strip` in styles/main.css). */
export function updateTabStripFade() {
  const bar = byId('tabBar');
  const maxScroll = bar.scrollWidth - bar.clientWidth;
  bar.toggleAttribute('data-fade-left', bar.scrollLeft > 1);
  bar.toggleAttribute('data-fade-right', bar.scrollLeft < maxScroll - 1);
}

/** Scrolls the tab strip so that the selected tab is visible (narrow screens). */
export function revealActiveTab() {
  const tab = byId('tabBar').querySelector('[aria-current="page"]');
  if (!tab) return;
  const bar = byId('tabBar');
  const left = tab.offsetLeft - bar.offsetLeft;
  if (left < bar.scrollLeft || left + tab.offsetWidth > bar.scrollLeft + bar.clientWidth) {
    bar.scrollTo({ left: left - (bar.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth' });
  }
}

function renderNavigation() {
  const onBoard = state.view === 'board';
  byId('viewBoard').classList.toggle('hidden', !onBoard);
  byId('viewHistory').classList.toggle('hidden', onBoard);
  renderTabs();
}

/** Full re-render of the current view. */
export function render() {
  renderNavigation();
  if (state.view === 'board') {
    renderStats();
    renderQuickWins();
    renderFilters();
    renderLists();
  }
  renderHistory();
}

/**
 * Lightweight refresh after a task change: only the counters, the quick wins
 * and the task's own list card are re-rendered, which avoids every card
 * flashing on each checkbox click.
 */
export function refreshTask(taskId) {
  const task = findTask(taskId);
  if (!task) return;
  renderStats();
  renderQuickWins();
  const list = findList(task.listId);
  const card = list && byId(`list-${list.id}`);
  if (card) keepTaskScroll(() => { card.outerHTML = listCard(list, false); });
  else renderLists();
}
