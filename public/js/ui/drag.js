/**
 * Drag and drop of tasks, built on pointer events (mouse, pen and touch).
 *
 * With a mouse, a task is grabbed anywhere outside its buttons; on touch
 * screens only by its handle, so that the page can still be scrolled.
 * Holding a task over a header tab opens that tab. This module only deals
 * with the gesture: the board is changed by the callbacks of `initTaskDrag`.
 */

import { dropIndex } from '../taskOrder.js';
import { byId } from '../utils.js';

/** Distance before a press becomes a drag, so that clicks keep working. */
const DRAG_THRESHOLD_PX = 5;
/** Time a task must be held over a tab before the tab opens. */
const TAB_HOVER_MS = 500;
/** Size of the edge that scrolls the page or a list, and scroll step per frame. */
const SCROLL_EDGE_PX = 48;
const SCROLL_STEP_PX = 10;

const HANDLE = '[data-drag-handle]';
const ROW = '[data-task-id]';
const CARD = '[data-list-card]';
const CONTROLS = 'button, a, input, label, select, textarea';

/**
 * @typedef {{ listId: string, beforeId: string | null }} DropTarget
 * @type {{ onDrop: (taskId: string, target: DropTarget) => void, onTabHover: (tabId: string) => void }}
 */
let callbacks = { onDrop: () => {}, onTabHover: () => {} };

/**
 * Press in progress (`ghost` is set once it has become a drag).
 * @type {null | {
 *   taskId: string, done: boolean, pointerId: number, row: HTMLElement,
 *   startX: number, startY: number, x: number, y: number, offsetX: number, offsetY: number,
 *   ghost: HTMLElement | null, target: DropTarget | null,
 *   hoveredTab: string | null, tabTimer: number | null, frame: number | null
 * }}
 */
let drag = null;

/* ───────── Drop target ───────── */

const rowsOf = card => [...card.querySelectorAll(ROW)].filter(row => (row.dataset.done === 'true') === drag.done);

function clearMarks() {
  document.querySelectorAll('[data-drop]').forEach(element => element.removeAttribute('data-drop'));
}

/** Index among `rows`: before all of them above the visible part of the list, after all of them below. */
function indexInCard(card, rows) {
  const scroller = card.querySelector('[data-task-scroll]');
  if (scroller) {
    const { top, bottom } = scroller.getBoundingClientRect();
    if (drag.y < top) return 0;
    if (drag.y > bottom) return rows.length;
  }
  return dropIndex(rows.map(row => row.getBoundingClientRect()), drag.y);
}

/** Finds where the task would land in `card` and shows it. */
function targetCard(card) {
  const sameGroup = rowsOf(card);
  const rows = sameGroup.filter(row => row.dataset.taskId !== drag.taskId);
  const index = indexInCard(card, rows);
  // Dropping a task back to its place must not change anything.
  if (index === sameGroup.findIndex(row => row.dataset.taskId === drag.taskId)) return;

  drag.target = { listId: card.dataset.listCard, beforeId: rows[index]?.dataset.taskId ?? null };
  card.dataset.drop = 'into';
  if (rows[index]) rows[index].dataset.drop = 'before';
  else if (rows.length) rows[rows.length - 1].dataset.drop = 'after';
}

/** Opens a tab once the task has been held over it long enough. */
function hoverTab(tabId) {
  if (drag.hoveredTab === tabId) return;
  clearTimeout(drag.tabTimer);
  drag.hoveredTab = tabId;
  if (!tabId) return;
  drag.tabTimer = setTimeout(() => {
    callbacks.onTabHover(tabId);
    updateTarget();
  }, TAB_HOVER_MS);
}

function updateTarget() {
  clearMarks();
  drag.target = null;
  const element = document.elementFromPoint(drag.x, drag.y);
  hoverTab(element?.closest('#tabBar [data-action="tab"]')?.dataset.id ?? null);
  const card = element?.closest(CARD);
  if (card) targetCard(card);
  // Re-rendered rows lose their style: find the dragged one again.
  document.querySelectorAll(ROW).forEach(row => {
    row.classList.toggle('task-dragged', row.dataset.taskId === drag.taskId);
  });
}

/* ───────── Scrolling near the edges ───────── */

/** -1, 0 or 1: direction in which the edge under `y` scrolls. */
function edgeDirection(y, top, bottom) {
  if (y >= top && y < top + SCROLL_EDGE_PX) return -1;
  return y > bottom - SCROLL_EDGE_PX && y <= bottom ? 1 : 0;
}

function autoScroll() {
  const scroller = document.elementFromPoint(drag.x, drag.y)?.closest('[data-task-scroll]');
  let moved = false;
  if (scroller) {
    const { top, bottom } = scroller.getBoundingClientRect();
    const before = scroller.scrollTop;
    scroller.scrollTop += edgeDirection(drag.y, top, bottom) * SCROLL_STEP_PX;
    moved = scroller.scrollTop !== before;
  }
  if (!moved) {
    // The sticky header holds the tabs: the scrolling edge starts below it.
    const top = document.querySelector('header').getBoundingClientRect().bottom;
    const direction = edgeDirection(drag.y, top, window.innerHeight);
    if (direction) {
      window.scrollBy(0, direction * SCROLL_STEP_PX);
      moved = true;
    }
  }
  if (moved) updateTarget();
  drag.frame = window.requestAnimationFrame(autoScroll);
}

/* ───────── Gesture ───────── */

function createGhost() {
  const { left, top, width } = drag.row.getBoundingClientRect();
  drag.offsetX = drag.startX - left;
  drag.offsetY = drag.startY - top;
  const ghost = drag.row.cloneNode(true);
  // The copy must not be mistaken for a real task row.
  for (const name of ['data-task-id', 'data-done']) ghost.removeAttribute(name);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.add('task-ghost');
  ghost.style.width = `${width}px`;
  document.body.append(ghost);
  return ghost;
}

function startDrag() {
  drag.ghost = createGhost();
  document.documentElement.classList.add('task-drag-active');
  document.getSelection()?.removeAllRanges();
  // Keeps receiving the events when the row is re-rendered (tab change).
  document.documentElement.setPointerCapture?.(drag.pointerId);
  drag.frame = window.requestAnimationFrame(autoScroll);
}

function stopDrag() {
  clearTimeout(drag.tabTimer);
  if (drag.ghost) {
    window.cancelAnimationFrame(drag.frame);
    drag.ghost.remove();
    clearMarks();
    document.documentElement.classList.remove('task-drag-active');
    document.querySelectorAll('.task-dragged').forEach(row => row.classList.remove('task-dragged'));
    ignoreNextClick();
  }
  drag = null;
}

/** The browser fires a click when the button is released: it must not act on the page. */
function ignoreNextClick() {
  const swallow = event => {
    event.preventDefault();
    event.stopPropagation();
  };
  document.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 0);
}

function onPointerDown(event) {
  if (drag || event.button !== 0 || event.isPrimary === false) return;
  const row = event.target.closest(ROW);
  if (!row) return;
  const onHandle = event.target.closest(HANDLE);
  if (!onHandle && (event.pointerType === 'touch' || event.target.closest(CONTROLS))) return;
  drag = {
    taskId: row.dataset.taskId, done: row.dataset.done === 'true', pointerId: event.pointerId, row,
    startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, offsetX: 0, offsetY: 0,
    ghost: null, target: null, hoveredTab: null, tabTimer: null, frame: null
  };
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  // The button was released where the page could not see it.
  if (event.buttons === 0) {
    stopDrag();
    return;
  }
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (!drag.ghost) {
    if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DRAG_THRESHOLD_PX) return;
    startDrag();
  }
  drag.ghost.style.transform = `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px)`;
  updateTarget();
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const { taskId, target } = drag;
  stopDrag();
  if (target) callbacks.onDrop(taskId, target);
}

function onPointerCancel(event) {
  if (drag && event.pointerId === drag.pointerId) stopDrag();
}

function onKeyDown(event) {
  if (!drag?.ghost || event.key !== 'Escape') return;
  event.stopPropagation();
  stopDrag();
}

/** While a task is held, the browser must neither select text nor start its own drag. */
function preventDuringDrag(event) {
  if (drag) event.preventDefault();
}

/**
 * Attaches the drag listeners (call once at startup).
 * @param {typeof callbacks} handlers `onDrop` receives the task and where it
 *   was dropped; `onTabHover` the tab to open.
 */
export function initTaskDrag(handlers) {
  callbacks = handlers;
  byId('lists').addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerCancel);
  document.addEventListener('keydown', onKeyDown, { capture: true });
  document.addEventListener('selectstart', preventDuringDrag);
  document.addEventListener('dragstart', preventDuringDrag);
}
