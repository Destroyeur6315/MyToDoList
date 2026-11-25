'use strict';

/**
 * Unit tests for input validation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ValidationError } = require('../src/http/errors');
const {
  normalizeList, normalizeTab, normalizeTabUpdate, normalizeTask, normalizeTaskUpdate,
  validateBoardSnapshot
} = require('../src/domain/validation');

const NOW = 1_700_000_000_000;
const task = overrides => ({
  id: 't1', listId: 'l1', name: 'Tâche', duration: 'h1', criticality: 2, status: 'todo', ...overrides
});

test('normalizeTab trims the name, drops unknown fields and fills the date', () => {
  assert.deepEqual(normalizeTab({ id: 'tab1', name: '  Perso ', position: 3 }, NOW), { id: 'tab1', name: 'Perso', createdAt: NOW });
  assert.equal(normalizeTab({ id: 'tab1', name: 'x'.repeat(40), createdAt: 5 }).createdAt, 5);
});

test('normalizeTab rejects unsafe ids, blank or too long names and bad dates', () => {
  assert.throws(() => normalizeTab(null), ValidationError);
  assert.throws(() => normalizeTab({ id: '../x', name: 'ok' }), ValidationError);
  assert.throws(() => normalizeTab({ id: 'tab1', name: '  ' }), ValidationError);
  assert.throws(() => normalizeTab({ id: 'tab1', name: 'x'.repeat(41) }), ValidationError);
  assert.throws(() => normalizeTab({ id: 'tab1', name: 'ok', createdAt: 1.5 }), ValidationError);
});

test('normalizeTabUpdate keeps unspecified fields and validates the position', () => {
  const existing = { id: 'tab1', name: 'Perso', createdAt: 1 };
  assert.deepEqual(normalizeTabUpdate({}, existing), { name: 'Perso', position: undefined });
  assert.deepEqual(normalizeTabUpdate({ name: ' Boulot ', position: 0 }, existing), { name: 'Boulot', position: 0 });
  for (const position of [-1, 1.5, '2', null]) {
    assert.throws(() => normalizeTabUpdate({ position }, existing), ValidationError, String(position));
  }
  assert.throws(() => normalizeTabUpdate({ name: '' }, existing), ValidationError);
});

test('normalizeList trims the name, drops unknown fields and fills dates', () => {
  const list = normalizeList({ id: 'l1', tabId: 'tab1', name: '  Projet ', masked: true }, NOW);
  assert.deepEqual(list, { id: 'l1', tabId: 'tab1', name: 'Projet', archived: false, archivedAt: null, createdAt: NOW });
});

test('normalizeList rejects unsafe ids, a missing tab and blank or too long names', () => {
  assert.throws(() => normalizeList({ id: '../x', tabId: 'tab1', name: 'ok' }), ValidationError);
  assert.throws(() => normalizeList({ id: 'l1', name: 'ok' }), ValidationError);
  assert.throws(() => normalizeList({ id: 'l1', tabId: '../x', name: 'ok' }), ValidationError);
  assert.throws(() => normalizeList({ id: 'l1', tabId: 'tab1', name: '   ' }), ValidationError);
  assert.throws(() => normalizeList({ id: 'l1', tabId: 'tab1', name: 'x'.repeat(61) }), ValidationError);
  assert.throws(() => normalizeList({ id: 'l1', tabId: 'tab1', name: 'ok', createdAt: -1 }), ValidationError);
});

test('normalizeTask sets completedAt only for finished tasks', () => {
  assert.equal(normalizeTask(task({ status: 'done' }), NOW).completedAt, NOW);
  assert.equal(normalizeTask(task({ status: 'done', completedAt: 5 }), NOW).completedAt, 5);
  assert.equal(normalizeTask(task({ status: 'doing', completedAt: 5 }), NOW).completedAt, null);
  assert.equal(normalizeTask(task(), NOW).description, '');
});

test('normalizeTask accepts a position and defaults to the automatic order', () => {
  assert.equal(normalizeTask(task()).position, null);
  for (const position of [null, 0, 12]) assert.equal(normalizeTask(task({ position })).position, position);
  for (const position of [-1, 1.5, '2', true, 2 ** 53]) {
    assert.throws(() => normalizeTask(task({ position })), ValidationError, String(position));
  }
});

test('normalizeTaskUpdate keeps the identity, and the position only within the same list', () => {
  const existing = normalizeTask(task({ position: 3, createdAt: 5 }));
  assert.deepEqual(normalizeTaskUpdate({ id: 'x', createdAt: 9 }, existing), existing);
  assert.deepEqual(normalizeTaskUpdate(undefined, existing), existing);
  assert.equal(normalizeTaskUpdate({ position: 1 }, existing).position, 1);
  assert.equal(normalizeTaskUpdate({ position: null }, existing).position, null);
  assert.equal(normalizeTaskUpdate({ listId: 'l1', name: 'X' }, existing).position, 3);
  assert.equal(normalizeTaskUpdate({ listId: 'l2' }, existing).position, null);
  assert.equal(normalizeTaskUpdate({ listId: 'l2', position: 0 }, existing).position, 0);
  assert.throws(() => normalizeTaskUpdate({ position: -1 }, existing), ValidationError);
});

test('normalizeTask rejects out-of-range values', () => {
  for (const bad of [
    { criticality: 0 }, { criticality: 5 }, { criticality: 2.5 },
    { duration: 'year' }, { status: 'paused' }, { description: 'x'.repeat(601) }
  ]) {
    assert.throws(() => normalizeTask(task(bad)), ValidationError, JSON.stringify(bad));
  }
});

test('validateBoardSnapshot rejects duplicates, orphan lists and orphan tasks', () => {
  const tabs = [{ id: 'tab1', name: 'Perso' }];
  const list = { id: 'l1', tabId: 'tab1', name: 'A' };
  const snapshot = overrides => ({ revision: 0, tabs, lists: [list], tasks: [task()], ...overrides });
  assert.doesNotThrow(() => validateBoardSnapshot(snapshot()));
  assert.throws(() => validateBoardSnapshot(snapshot({ lists: [list, list], tasks: [] })), ValidationError);
  assert.throws(() => validateBoardSnapshot(snapshot({ tasks: [task(), task()] })), ValidationError);
  assert.throws(() => validateBoardSnapshot(snapshot({ tasks: [task({ listId: 'l2' })] })), ValidationError);
  assert.throws(() => validateBoardSnapshot(snapshot({ lists: [{ ...list, tabId: 'tab2' }] })), ValidationError);
  assert.throws(() => validateBoardSnapshot(snapshot({ tabs: [...tabs, ...tabs] })), ValidationError);
  assert.throws(() => validateBoardSnapshot(snapshot({ revision: -1 })), ValidationError);
});

test('validateBoardSnapshot requires between 1 and 20 tabs and keeps their order', () => {
  const many = count => Array.from({ length: count }, (_, i) => ({ id: `tab${i}`, name: `Onglet ${i}` }));
  assert.throws(() => validateBoardSnapshot({ revision: 0, tabs: [], lists: [], tasks: [] }), ValidationError);
  assert.throws(() => validateBoardSnapshot({ revision: 0, lists: [], tasks: [] }), ValidationError, 'tabs are mandatory');
  assert.throws(() => validateBoardSnapshot({ revision: 0, tabs: many(21), lists: [], tasks: [] }), ValidationError);
  const { tabs } = validateBoardSnapshot({ revision: 0, tabs: many(20).reverse(), lists: [], tasks: [] });
  assert.equal(tabs[0].id, 'tab19');
});
