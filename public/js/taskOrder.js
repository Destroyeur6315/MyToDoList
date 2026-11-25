/**
 * Pure helpers for the order of the tasks in a list. No DOM and no shared
 * state: unit tested with `node --test` (tests/taskOrder.test.js).
 *
 * A list is sorted automatically (status, quick-win score, criticality) until
 * one of its tasks is moved by hand: its tasks then carry a `position`. Tasks
 * without a position (`null`) come after those that have one. Finished tasks
 * always stay at the bottom.
 */

import { durationOf } from './constants.js';

/**
 * @typedef {import('./state.js').Task} Task
 */

const STATUS_RANK = { doing: 0, todo: 1, done: 2 };

const isDone = task => task.status === 'done';
const isPositioned = task => Number.isInteger(task.position);

/**
 * Quick-win score: high impact for little effort.
 * Impact goes from 4 (critical) to 1 (low), divided by the duration weight.
 */
export function quickWinScore(task) {
  const impact = 5 - Number(task.criticality);
  return Math.round(impact / durationOf(task.duration).weight * 40);
}

/** In progress first, then to-do, then done; within a group by score then criticality. */
const compareAutomatically = (a, b) =>
  STATUS_RANK[a.status] - STATUS_RANK[b.status]
  || quickWinScore(b) - quickWinScore(a)
  || a.criticality - b.criticality;

function compareTasks(a, b) {
  if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
  if (isPositioned(a) && isPositioned(b)) return a.position - b.position;
  if (isPositioned(a) !== isPositioned(b)) return isPositioned(a) ? -1 : 1;
  return compareAutomatically(a, b);
}

/**
 * Tasks of a list in display order.
 * @param {Task[]} tasks
 * @returns {Task[]} A new array.
 */
export const sortTasks = tasks => tasks.slice().sort(compareTasks);

/** Whether at least one of the tasks was placed by hand. */
export const hasManualOrder = tasks => tasks.some(isPositioned);

/**
 * Display order of a list once `task` is dropped in it. Open and finished
 * tasks stay grouped: the drop only places the task within its own group.
 * @param {Task[]} tasks Other tasks of the target list.
 * @param {Task} task
 * @param {string | null} beforeId Task to insert before, `null` for the end.
 * @returns {Task[]} Target list, `task` included.
 */
export function insertTask(tasks, task, beforeId) {
  const ordered = sortTasks(tasks.filter(t => t.id !== task.id));
  const index = ordered.findIndex(t => t.id === beforeId);
  ordered.splice(index < 0 ? ordered.length : index, 0, task);
  return [...ordered.filter(t => !isDone(t)), ...ordered.filter(isDone)];
}

/**
 * Whether the automatic sort alone gives this order, so that no position has
 * to be stored.
 * @param {Task[]} ordered Wanted order.
 * @param {Task[]} stored Same tasks in storage order, which breaks ties.
 */
export function isAutomaticOrder(ordered, stored) {
  const automatic = stored.slice().sort(compareAutomatically);
  return ordered.every((task, index) => task.id === automatic[index]?.id);
}

/**
 * Task before which to insert `id` to move it by `offset` (-1: up, 1: down)
 * among the tasks on screen.
 * @param {Task[]} visible Tasks on screen, in display order.
 * @param {string} id
 * @param {number} offset
 * @returns {{ beforeId: string | null } | null} `null` when the move is
 *   impossible (either end, or the border between open and finished tasks).
 */
export function stepTarget(visible, id, offset) {
  const index = visible.findIndex(t => t.id === id);
  const neighbour = visible[index + offset];
  if (index < 0 || !neighbour || isDone(neighbour) !== isDone(visible[index])) return null;
  const before = offset < 0 ? neighbour : visible[index + 2];
  return { beforeId: before?.id ?? null };
}

/**
 * Index where a dragged row lands, from the vertical geometry of the others.
 * @param {{ top: number, height: number }[]} rows From top to bottom.
 * @param {number} y Pointer position.
 * @returns {number} 0 (above every row) to `rows.length` (below).
 */
export function dropIndex(rows, y) {
  const index = rows.findIndex(row => y < row.top + row.height / 2);
  return index < 0 ? rows.length : index;
}
