'use strict';

/**
 * Unit tests for the front-end tab helpers (public/js/tabs.js, an ES module).
 */

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

/** @type {typeof import('../public/js/tabs.js')} */
let tabs;
before(async () => {
  tabs = await import('../public/js/tabs.js');
});

const tab = id => ({ id, name: id.toUpperCase(), createdAt: 1 });
const ids = list => list.map(t => t.id);

test('normalizeTabs sorts by position then creation date and drops the position', () => {
  const result = tabs.normalizeTabs([
    { id: 'c', name: 'C', position: 2, createdAt: 1 },
    { id: 'b', name: 'B', position: 0, createdAt: 9 },
    { id: 'a', name: 'A', position: 0, createdAt: 5 }
  ]);
  assert.deepEqual(ids(result), ['a', 'b', 'c']);
  assert.deepEqual(result[0], { id: 'a', name: 'A', createdAt: 5 });
  assert.deepEqual(tabs.normalizeTabs(undefined), []);
});

test('moveTab moves a tab left or right without mutating the input', () => {
  const input = [tab('a'), tab('b'), tab('c')];
  assert.deepEqual(ids(tabs.moveTab(input, 'c', -1)), ['a', 'c', 'b']);
  assert.deepEqual(ids(tabs.moveTab(input, 'a', 1)), ['b', 'a', 'c']);
  assert.deepEqual(ids(tabs.moveTab(input, 'c', -2)), ['c', 'a', 'b']);
  assert.deepEqual(ids(input), ['a', 'b', 'c']);
});

test('moveTab ignores moves past either end and unknown tabs', () => {
  const input = [tab('a'), tab('b')];
  assert.deepEqual(ids(tabs.moveTab(input, 'a', -1)), ['a', 'b']);
  assert.deepEqual(ids(tabs.moveTab(input, 'b', 1)), ['a', 'b']);
  assert.deepEqual(ids(tabs.moveTab(input, 'zz', 1)), ['a', 'b']);
  assert.notEqual(tabs.moveTab(input, 'a', -1), input, 'always returns a new array');
});

test('tabAfterRemoval keeps the active tab or picks a neighbour', () => {
  const input = [tab('a'), tab('b'), tab('c')];
  assert.equal(tabs.tabAfterRemoval(input, 'a', 'c'), 'c', 'another tab was active');
  assert.equal(tabs.tabAfterRemoval(input, 'b', 'b'), 'c', 'right-hand neighbour first');
  assert.equal(tabs.tabAfterRemoval(input, 'c', 'c'), 'b', 'left-hand neighbour for the last tab');
  assert.equal(tabs.tabAfterRemoval(input, 'a', 'gone'), 'b', 'unknown active tab');
  assert.equal(tabs.tabAfterRemoval([tab('a')], 'a', 'a'), null, 'no tab left');
});

test('cleanTabName trims names and rejects blank, too long or non-string values', () => {
  assert.equal(tabs.cleanTabName('  Perso  ', 40), 'Perso');
  assert.equal(tabs.cleanTabName('x'.repeat(40), 40), 'x'.repeat(40));
  assert.equal(tabs.cleanTabName('x'.repeat(41), 40), null);
  assert.equal(tabs.cleanTabName('   ', 40), null);
  assert.equal(tabs.cleanTabName(undefined, 40), null);
});
