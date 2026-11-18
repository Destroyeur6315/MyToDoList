/**
 * HTML builders for the dynamic parts of the page. Every function is pure:
 * it returns a string and never touches the DOM. User text is always passed
 * through `escapeHtml`.
 *
 * Interactive elements carry `data-action` (+ `data-id`) attributes; clicks
 * are handled by a single delegated listener in actions.js.
 */

import { criticalityOf, durationOf } from '../constants.js';
import {
  findList, isListMasked, isQuickWin, listStats, matchesFilters, sortTasks, tasksOf
} from '../state.js';
import { escapeHtml, formatDate, plural } from '../utils.js';
import { ICONS, svgIcon } from './icons.js';

/** Extra class that blurs the text of a masked list. */
const maskClass = listId => (isListMasked(listId) ? ' masked-text' : '');

/**
 * Small square icon button used in list and task headers.
 * @param {{ action: string, id: string, label: string, icon: string,
 *   danger?: boolean, pressed?: boolean }} options
 */
function iconButton({ action, id, label, icon, danger = false, pressed }) {
  const hover = danger ? 'hover:bg-rose-500/10 hover:text-rose-600' : 'hover:bg-surface2 hover:text-ink';
  const color = pressed ? 'text-ink' : 'text-muted';
  const pressedAttr = pressed === undefined ? '' : ` aria-pressed="${pressed}"`;
  return `<button type="button" data-action="${action}" data-id="${escapeHtml(id)}" aria-label="${label}" title="${label}"${pressedAttr}`
    + ` class="grid h-7 w-7 place-items-center rounded-lg ${color} transition ${hover}">${svgIcon(icon, 14)}</button>`;
}

/* ───────── Task pieces ───────── */

/** Criticality and duration badges. */
function taskChips(task) {
  const criticality = criticalityOf(task.criticality);
  return `<span class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${criticality.chip}">`
    + `<span class="h-1.5 w-1.5 rounded-full ${criticality.dot}"></span>${criticality.label}</span>`
    + '<span class="inline-flex items-center rounded-md bg-surface2 px-1.5 py-0.5 text-[11px] font-medium text-muted">'
    + `${durationOf(task.duration).short}</span>`;
}

/** Round checkbox that toggles a task between done and not done. */
function doneToggle(task) {
  const id = escapeHtml(task.id);
  if (task.status === 'done') {
    return `<button type="button" data-action="toggle-done" data-id="${id}" aria-label="Rouvrir la tâche"`
      + ' class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ok text-white transition">'
      + `${svgIcon(ICONS.check, 12)}</button>`;
  }
  const border = task.status === 'doing' ? 'border-accent' : 'border-line';
  return `<button type="button" data-action="toggle-done" data-id="${id}" aria-label="Marquer comme terminée"`
    + ` class="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 transition hover:border-ok ${border}"></button>`;
}

/** "Démarrer / En cours" pill. */
function progressToggle(task) {
  const active = task.status === 'doing';
  const label = active ? 'Retirer le statut en cours' : 'Mettre en cours';
  return `<button type="button" data-action="toggle-progress" data-id="${escapeHtml(task.id)}" aria-pressed="${active}"`
    + ` aria-label="${label}" class="progress-toggle"><span class="progress-dot"></span>${active ? 'En cours' : 'Démarrer'}</button>`;
}

const quickWinBadge = () =>
  '<span class="inline-flex items-center gap-0.5 rounded-md bg-accent/20 px-1.5 py-0.5 text-[11px] font-semibold text-ink">'
  + `${svgIcon(ICONS.bolt, 10)}quick win</span>`;

/**
 * One task line.
 * @param {import('../state.js').Task} task
 * @param {boolean} readOnly History mode: no actions, checked icon only.
 */
export function taskRow(task, readOnly = false) {
  const done = task.status === 'done';
  const open = !done && !readOnly;

  let tone;
  if (readOnly) tone = 'opacity-70';
  else if (done) tone = 'opacity-40';
  else if (task.status === 'doing') tone = 'task-in-progress';
  else tone = 'hover:bg-surface2/60';

  const checkbox = readOnly
    ? `<span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ok/80 text-white">${svgIcon(ICONS.check, 12)}</span>`
    : doneToggle(task);

  const description = task.description
    ? `<p data-action="toggle-desc" class="mt-0.5 line-clamp-2 cursor-pointer text-[12.5px] leading-snug text-muted${maskClass(task.listId)}">`
      + `${escapeHtml(task.description)}</p>`
    : '';

  const actions = readOnly ? '' :
    '<div class="flex shrink-0 items-start gap-0.5 opacity-60 transition group-hover:opacity-100">'
    + iconButton({ action: 'edit-task', id: task.id, label: 'Modifier la tâche', icon: ICONS.edit })
    + iconButton({ action: 'del-task', id: task.id, label: 'Supprimer la tâche', icon: ICONS.trash, danger: true })
    + '</div>';

  return `<li class="group flex gap-2.5 rounded-xl px-2 py-2 transition ${tone}">`
    + checkbox
    + '<div class="min-w-0 flex-1">'
    + `<p class="text-[14px] font-medium leading-snug${done ? ' line-through' : ''}${maskClass(task.listId)}">${escapeHtml(task.name)}</p>`
    + description
    + '<div class="mt-1.5 flex flex-wrap items-center gap-1">'
    + taskChips(task)
    + (open ? progressToggle(task) : '')
    + (open && isQuickWin(task) ? quickWinBadge() : '')
    + '</div>'
    + '</div>'
    + actions
    + '</li>';
}

/* ───────── Board ───────── */

/** Card of the "À faire maintenant" banner. */
export function quickWinCard({ task, score }) {
  const list = findList(task.listId);
  const background = task.status === 'doing' ? 'task-in-progress' : 'bg-surface hover:bg-surface2';
  return `<div class="group flex w-full items-start gap-3 rounded-xl p-3 text-left shadow-xs transition ${background}">`
    + `<button type="button" data-action="toggle-done" data-id="${escapeHtml(task.id)}" aria-label="Terminer la tâche" title="Terminer la tâche"`
    + ' class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-accent/40 transition hover:border-ok hover:bg-ok/15"></button>'
    + '<div class="min-w-0 flex-1">'
    + `<p class="text-[14px] font-semibold leading-snug text-ink${maskClass(task.listId)}">${escapeHtml(task.name)}</p>`
    + '<div class="mt-1.5 flex flex-wrap items-center gap-1">'
    + taskChips(task)
    + `<span class="inline-flex items-center rounded-md bg-surface2 px-1.5 py-0.5 text-[11px] font-medium text-muted${maskClass(task.listId)}">`
    + `${escapeHtml(list ? list.name : '')}</span>`
    + progressToggle(task)
    + '</div>'
    + '</div>'
    + `<span class="tabular shrink-0 rounded-md bg-accent/10 px-1.5 py-0.5 font-display text-[12px] font-semibold text-accent">${score}</span>`
    + '</div>';
}

/**
 * Card of an active list with its filtered tasks.
 * @param {import('../state.js').List} list
 * @param {boolean} [animate=true] Fade in (disabled for in-place refreshes).
 */
export function listCard(list, animate = true) {
  const stats = listStats(list.id);
  const visible = sortTasks(tasksOf(list.id).filter(matchesFilters));
  const filteredOut = stats.total - visible.length;
  const masked = isListMasked(list.id);

  let body;
  if (!stats.total) {
    body = '<p class="px-2 py-4 text-[13px] text-muted">Liste vide. Ajoutez la première tâche pour lancer le mouvement.</p>';
  } else if (!visible.length) {
    body = '<p class="px-2 py-4 text-[13px] text-muted">Aucune tâche ne correspond au filtre.</p>';
  } else {
    body = `<ul class="-mx-2 divide-y divide-line/60">${visible.map(t => taskRow(t)).join('')}</ul>`;
  }

  let summary = `${stats.done}/${stats.total} terminées`;
  if (stats.doing) summary += ` · ${stats.doing} en cours`;
  if (filteredOut > 0) summary += ` · ${filteredOut} masquée${filteredOut > 1 ? 's' : ''}`;

  const footer = stats.complete
    ? '<label class="mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl border border-ok/30 bg-ok/10 px-3 py-2.5 text-[13px] font-medium">'
      + `<input type="checkbox" data-action="archive" data-id="${escapeHtml(list.id)}" class="h-4 w-4 shrink-0" style="accent-color:rgb(var(--ok))">`
      + '<span>Liste terminée — la ranger dans l\'historique</span></label>'
    : `<button type="button" data-action="new-task" data-id="${escapeHtml(list.id)}"`
      + ' class="mt-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-[13px] font-medium text-muted transition hover:border-accent hover:text-ink">'
      + `${svgIcon(ICONS.plus, 14)}Ajouter une tâche</button>`;

  const skin = stats.complete ? 'bg-surface2 border-line' : 'bg-surface border-line';
  return `<article id="list-${escapeHtml(list.id)}" class="${animate ? 'fade-in ' : ''}flex flex-col rounded-xl2 border p-4 transition ${skin}">`
    + '<div class="flex items-start gap-2">'
    + '<div class="min-w-0 flex-1">'
    + `<h3 class="font-display text-[15px] font-semibold leading-snug${stats.complete ? ' text-muted' : ''}${maskClass(list.id)}">${escapeHtml(list.name)}</h3>`
    + `<p class="mt-0.5 tabular text-[12px] text-muted">${summary}</p>`
    + '</div>'
    + iconButton({
      action: 'mask-list', id: list.id, pressed: masked,
      label: masked ? 'Afficher le texte de la liste' : 'Masquer le texte de la liste',
      icon: masked ? ICONS.eyeOff : ICONS.eye
    })
    + iconButton({ action: 'edit-list', id: list.id, label: 'Renommer la liste', icon: ICONS.edit })
    + iconButton({ action: 'del-list', id: list.id, label: 'Supprimer la liste', icon: ICONS.trash, danger: true })
    + '</div>'
    + '<div class="mt-3 h-1 w-full overflow-hidden rounded-full bg-line">'
    + `<div class="h-full rounded-full ${stats.complete ? 'bg-ok' : 'bg-accent'}" style="width:${stats.percent}%;transition:width .4s ease"></div></div>`
    + `<div class="mt-2 flex-1">${body}</div>`
    + footer
    + '</article>';
}

/* ───────── History ───────── */

/** Card of an archived list. */
export function historyCard(list) {
  const tasks = tasksOf(list.id);
  return '<article class="fade-in flex flex-col rounded-xl2 border border-line bg-surface2 p-4">'
    + '<div class="flex items-start gap-2"><div class="min-w-0 flex-1">'
    + `<h3 class="font-display text-[15px] font-semibold leading-snug${maskClass(list.id)}">${escapeHtml(list.name)}</h3>`
    + `<p class="mt-0.5 text-[12px] text-muted">${plural(tasks.length, 'tâche')} · rangée le ${formatDate(list.archivedAt || Date.now())}</p>`
    + '</div></div>'
    + `<ul class="-mx-2 mt-2 flex-1 divide-y divide-line/60">${tasks.map(t => taskRow(t, true)).join('')}</ul>`
    + '<div class="mt-3 flex gap-2">'
    + `<button type="button" data-action="restore" data-id="${escapeHtml(list.id)}"`
    + ' class="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-[13px] font-medium transition hover:border-accent">'
    + `${svgIcon(ICONS.undo, 14)}Restaurer</button>`
    + `<button type="button" data-action="purge" data-id="${escapeHtml(list.id)}" aria-label="Supprimer définitivement"`
    + ' class="grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-muted transition hover:bg-rose-500/10 hover:text-rose-600">'
    + `${svgIcon(ICONS.trash, 14)}</button>`
    + '</div></article>';
}
