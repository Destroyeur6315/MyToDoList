'use strict';

/**
 * Unit tests for the task order helpers (public/js/taskOrder.js, an ES module).
 */

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

/** @type {typeof import('../public/js/taskOrder.js')} */
let order;
before(async () => {
  order = await import('../public/js/taskOrder.js');
});

const task = (id, overrides) => ({ id, status: 'todo', duration: 'h1', criticality: 3, position: null, ...overrides });
const ids = tasks => tasks.map(t => t.id);

test('quickWinScore favours short and critical tasks', () => {
  assert.equal(order.quickWinScore(task('a', { duration: 'min', criticality: 1 })), 160);
  assert.equal(order.quickWinScore(task('a', { duration: 'month', criticality: 4 })), 1);
});

test('sortTasks is automatic without positions: status, then score, then criticality', () => {
  const tasks = [
    task('done', { status: 'done', criticality: 1 }),
    task('low', { criticality: 4 }),
    task('urgent', { criticality: 1 }),
    task('doing', { status: 'doing', criticality: 4 })
  ];
  assert.deepEqual(ids(order.sortTasks(tasks)), ['doing', 'urgent', 'low', 'done']);
  assert.deepEqual(ids(tasks), ['done', 'low', 'urgent', 'doing'], 'the input is not changed');
});

test('sortTasks follows positions, then unpositioned tasks, with finished tasks last', () => {
  const tasks = [
    task('new', { criticality: 1 }),
    task('doing', { status: 'doing', position: 2 }),
    task('done', { status: 'done', position: 0 }),
    task('first', { criticality: 4, position: 1 })
  ];
  assert.deepEqual(ids(order.sortTasks(tasks)), ['first', 'doing', 'new', 'done']);
});

test('hasManualOrder is true as soon as one task has a position', () => {
  assert.equal(order.hasManualOrder([]), false);
  assert.equal(order.hasManualOrder([task('a'), { ...task('b'), position: undefined }]), false);
  assert.equal(order.hasManualOrder([task('a'), task('b', { position: 0 })]), true);
});

test('insertTask places a task before another one, or at the end', () => {
  const tasks = ['a', 'b', 'c'].map((id, position) => task(id, { position }));
  assert.deepEqual(ids(order.insertTask(tasks, tasks[2], 'a')), ['c', 'a', 'b']);
  assert.deepEqual(ids(order.insertTask(tasks, tasks[0], null)), ['b', 'c', 'a']);
  assert.deepEqual(ids(order.insertTask(tasks, task('x'), 'b')), ['a', 'x', 'b', 'c']);
  assert.deepEqual(ids(order.insertTask(tasks, task('x'), 'absent')), ['a', 'b', 'c', 'x']);
  assert.deepEqual(ids(order.insertTask([], task('x'), null)), ['x']);
});

test('insertTask keeps open and finished tasks grouped', () => {
  const tasks = [task('a'), task('b', { status: 'done' }), task('c', { status: 'done', criticality: 4 })];
  assert.deepEqual(ids(order.insertTask(tasks, task('x'), null)), ['a', 'x', 'b', 'c']);
  assert.deepEqual(ids(order.insertTask(tasks, task('x', { status: 'done' }), 'a')), ['a', 'x', 'b', 'c']);
  assert.deepEqual(ids(order.insertTask(tasks, tasks[2], 'b')), ['a', 'c', 'b']);
});

test('isAutomaticOrder compares with the automatic sort, ties in storage order', () => {
  const [a, b, urgent] = [task('a'), task('b'), task('urgent', { criticality: 1, position: 2 })];
  const stored = [a, b, urgent];
  assert.equal(order.isAutomaticOrder([urgent, a, b], stored), true);
  assert.equal(order.isAutomaticOrder([urgent, b, a], stored), false, 'swapping equal tasks is a manual order');
  assert.equal(order.isAutomaticOrder([a, urgent, b], stored), false);
});

test('stepTarget gives the place one step up or down', () => {
  const visible = [task('a'), task('b'), task('c'), task('d', { status: 'done' })];
  assert.deepEqual(order.stepTarget(visible, 'b', -1), { beforeId: 'a' });
  assert.deepEqual(order.stepTarget(visible, 'a', 1), { beforeId: 'c' });
  assert.deepEqual(order.stepTarget(visible, 'b', 1), { beforeId: 'd' });
  assert.deepEqual(order.stepTarget(visible.slice(0, 2), 'a', 1), { beforeId: null });
});

test('stepTarget refuses both ends, the finished group border and unknown tasks', () => {
  const visible = [task('a'), task('b', { status: 'done' })];
  assert.equal(order.stepTarget(visible, 'a', -1), null);
  assert.equal(order.stepTarget(visible, 'b', 1), null);
  assert.equal(order.stepTarget(visible, 'a', 1), null);
  assert.equal(order.stepTarget(visible, 'b', -1), null);
  assert.equal(order.stepTarget(visible, 'absent', 1), null);
});

test('dropIndex compares the pointer with the middle of each row', () => {
  const rows = [{ top: 0, height: 40 }, { top: 40, height: 60 }];
  assert.equal(order.dropIndex(rows, -10), 0);
  assert.equal(order.dropIndex(rows, 19), 0);
  assert.equal(order.dropIndex(rows, 20), 1);
  assert.equal(order.dropIndex(rows, 69), 1);
  assert.equal(order.dropIndex(rows, 70), 2);
  assert.equal(order.dropIndex([], 5), 0);
});
