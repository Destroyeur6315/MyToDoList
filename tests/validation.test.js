'use strict';

/**
 * Unit tests for input validation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ValidationError } = require('../src/http/errors');
const { normalizeList, normalizeTask, validateBoardSnapshot } = require('../src/domain/validation');

const NOW = 1_700_000_000_000;
const task = overrides => ({
  id: 't1', listId: 'l1', name: 'Tâche', duration: 'h1', criticality: 2, status: 'todo', ...overrides
});

test('normalizeList trims the name, drops unknown fields and fills dates', () => {
  const list = normalizeList({ id: 'l1', name: '  Projet ', masked: true }, NOW);
  assert.deepEqual(list, { id: 'l1', name: 'Projet', archived: false, archivedAt: null, createdAt: NOW });
});

test('normalizeList rejects unsafe ids and blank or too long names', () => {
  assert.throws(() => normalizeList({ id: '../x', name: 'ok' }), ValidationError);
  assert.throws(() => normalizeList({ id: 'l1', name: '   ' }), ValidationError);
  assert.throws(() => normalizeList({ id: 'l1', name: 'x'.repeat(61) }), ValidationError);
  assert.throws(() => normalizeList({ id: 'l1', name: 'ok', createdAt: -1 }), ValidationError);
});

test('normalizeTask sets completedAt only for finished tasks', () => {
  assert.equal(normalizeTask(task({ status: 'done' }), NOW).completedAt, NOW);
  assert.equal(normalizeTask(task({ status: 'done', completedAt: 5 }), NOW).completedAt, 5);
  assert.equal(normalizeTask(task({ status: 'doing', completedAt: 5 }), NOW).completedAt, null);
  assert.equal(normalizeTask(task(), NOW).description, '');
});

test('normalizeTask rejects out-of-range values', () => {
  for (const bad of [
    { criticality: 0 }, { criticality: 5 }, { criticality: 2.5 },
    { duration: 'year' }, { status: 'paused' }, { description: 'x'.repeat(601) }
  ]) {
    assert.throws(() => normalizeTask(task(bad)), ValidationError, JSON.stringify(bad));
  }
});

test('validateBoardSnapshot rejects duplicates and orphan tasks', () => {
  const list = { id: 'l1', name: 'A' };
  assert.doesNotThrow(() => validateBoardSnapshot({ revision: 0, lists: [list], tasks: [task()] }));
  assert.throws(() => validateBoardSnapshot({ revision: 0, lists: [list, list], tasks: [] }), ValidationError);
  assert.throws(() => validateBoardSnapshot({ revision: 0, lists: [list], tasks: [task(), task()] }), ValidationError);
  assert.throws(() => validateBoardSnapshot({ revision: 0, lists: [list], tasks: [task({ listId: 'l2' })] }), ValidationError);
  assert.throws(() => validateBoardSnapshot({ revision: -1, lists: [], tasks: [] }), ValidationError);
});
