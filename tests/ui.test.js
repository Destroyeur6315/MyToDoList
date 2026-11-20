'use strict';

/**
 * UI tests of the tabs feature. The real page (public/index.html) runs in
 * jsdom with the real front-end modules, against a real API server backed by
 * a throw-away SQLite file: each test clicks through the interface, then
 * checks both the page and what the server saved.
 */

const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const { openDatabase } = require('../src/db/database');
const { createApp } = require('../src/app');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytodolist-ui-'));
const db = openDatabase(path.join(tmpDir, 'ui.sqlite'));
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

let server;
let baseUrl;
let dom;
let cookie = null;
/** Errors thrown by the page (event handlers, rendering…). */
const pageErrors = [];
const realFetch = globalThis.fetch;
/** Timer functions replaced while the page runs, restored at the end. */
const TIMER_GLOBALS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'];
const realTimers = Object.fromEntries(TIMER_GLOBALS.map(name => [name, globalThis[name]]));
/** Timers started by the page (save retries, session checks, toasts, focus delays). */
const pageTimers = new Set();

/**
 * Tracking versions of the timer functions: every timer the page starts is
 * recorded, so that none can fire once the tests are over.
 */
const trackedTimers = {
  setTimeout(callback, delay, ...args) {
    const handle = realTimers.setTimeout(() => {
      pageTimers.delete(handle);
      callback(...args);
    }, delay);
    pageTimers.add(handle);
    return handle;
  },
  setInterval(callback, delay, ...args) {
    const handle = realTimers.setInterval(callback, delay, ...args);
    pageTimers.add(handle);
    return handle;
  },
  clearTimeout(handle) {
    pageTimers.delete(handle);
    realTimers.clearTimeout(handle);
  },
  clearInterval(handle) {
    pageTimers.delete(handle);
    realTimers.clearInterval(handle);
  }
};

/** Front-end modules, loaded once the fake browser is ready. */
let state;
let sync;
let render;

/** Browser globals the front-end modules use. */
const BROWSER_GLOBALS = ['window', 'document', 'localStorage', 'CSS', 'HTMLElement'];

/** Same-origin fetch for the page: resolves relative URLs and carries the session cookie. */
async function pageFetch(url, { method, headers, body } = {}) {
  const response = await realFetch(new URL(url, baseUrl), {
    method,
    body,
    headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) }
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return response;
}

/** Reads the board as saved on the server. */
async function serverState() {
  const response = await pageFetch('/api/state', { headers: { 'X-MyToDoList-Request': '1' } });
  return response.json();
}

async function waitFor(check, message = 'condition', timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${message}`);
    await new Promise(resolve => realTimers.setTimeout(resolve, 10));
  }
}

/** Waits until every local change has reached the server. */
const settle = () => waitFor(() => !sync.hasPendingChanges(), 'pending saves');

const $ = selector => dom.window.document.querySelector(selector);
const $$ = selector => [...dom.window.document.querySelectorAll(selector)];
const isOpen = id => !$(`#${id}`).classList.contains('modal-hidden');
const tabNames = () => $$('#tabBar [data-action="tab"]').map(button => button.textContent);
const activeTabName = () => $('#tabBar [aria-current="page"]')?.textContent;
const toastText = () => $('#toastText').textContent;
const managerRow = name => $$('#tabsManager li').find(row => row.querySelector('input').value === name);

/** Types a value in a field and fires the `change` event, like a user leaving the field. */
function changeValue(input, value) {
  input.value = value;
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

/** Creates a tab through the header "+" button and its dialog. */
function createTabFromHeader(name) {
  $('nav [data-action="new-tab"]').click();
  $('#tabName').value = name;
  $('#tabSubmit').click();
}

/** Creates a list in the active tab through the header button. */
function createListFromHeader(name) {
  $('header [data-action="new-list"]').click();
  $('#lName').value = name;
  $('#lSubmit').click();
}

before(async () => {
  // Same defaults as production, with more registrations allowed per hour.
  const defaultConfig = require('../src/config');
  const config = {
    ...defaultConfig,
    authRateLimits: { ...defaultConfig.authRateLimits, register: { ...defaultConfig.authRateLimits.register, limit: 100 } }
  };
  server = createApp({ db, config }).listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  // Log in before the page starts: the app then restores the session itself.
  await pageFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'X-MyToDoList-Request': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'ui-tester', password: 'un-mot-de-passe-solide' })
  });

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    // jsdom has no layout engine: smooth scrolling is simply not implemented.
    if (!/Not implemented/.test(error.message)) pageErrors.push(error);
  });
  // Scripts are not run by jsdom: the modules are imported below instead.
  dom = new JSDOM(html, { url: baseUrl, pretendToBeVisual: true, virtualConsole });
  for (const name of BROWSER_GLOBALS) globalThis[name] = dom.window[name];
  globalThis.fetch = pageFetch;
  Object.assign(globalThis, trackedTimers);

  await import('../public/js/main.js');
  state = await import('../public/js/state.js');
  sync = await import('../public/js/sync.js');
  render = await import('../public/js/ui/render.js');
  await waitFor(() => !dom.window.document.body.classList.contains('auth-locked'), 'the app to open');
});

afterEach(() => {
  assert.deepEqual(pageErrors.map(error => error.message), [], 'the page threw no error');
});

after(() => {
  for (const handle of pageTimers) realTimers.clearTimeout(handle);
  dom?.window.close();
  for (const name of BROWSER_GLOBALS) delete globalThis[name];
  globalThis.fetch = realFetch;
  Object.assign(globalThis, realTimers);
  server.close();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('the board opens on the leftmost tab, with History on the right', () => {
  assert.deepEqual(tabNames(), ['Mes listes']);
  assert.equal(activeTabName(), 'Mes listes');
  assert.equal($('#historyTab').getAttribute('aria-current'), 'false');

  $('#historyTab').click();
  assert.equal(activeTabName(), undefined, 'no tab is selected on the history view');
  assert.equal($('#historyTab').getAttribute('aria-current'), 'page');
  assert.ok($('#viewBoard').classList.contains('hidden'));

  $('#tabBar [data-action="tab"]').click();
  assert.equal(activeTabName(), 'Mes listes');
  assert.ok($('#viewHistory').classList.contains('hidden'));
});

test('creating a tab from the header selects it and saves it on the right', async () => {
  createTabFromHeader('  Boulot  ');
  assert.equal(isOpen('tabModal'), false);
  assert.deepEqual(tabNames(), ['Mes listes', 'Boulot']);
  assert.equal(activeTabName(), 'Boulot');
  assert.equal(toastText(), 'Onglet créé');

  await settle();
  const { tabs } = await serverState();
  assert.deepEqual(tabs.map(t => [t.name, t.position]), [['Mes listes', 0], ['Boulot', 1]]);
});

test('the tab dialog refuses a blank name, and the tab count is limited', () => {
  $('nav [data-action="new-tab"]').click();
  $('#tabName').value = '   ';
  $('#tabSubmit').click();
  assert.ok(isOpen('tabModal'), 'the dialog stays open');
  assert.equal(tabNames().length, 2);
  $('#tabModal [data-action="close-modal"]').click();

  const saved = state.state.tabs;
  state.state.tabs = Array.from({ length: 20 }, (_, i) => ({ id: `fake${i}`, name: `T${i}`, createdAt: 1 }));
  try {
    $('nav [data-action="new-tab"]').click();
    assert.equal(isOpen('tabModal'), false);
    assert.equal(toastText(), 'Limite de 20 onglets atteinte');
  } finally {
    state.state.tabs = saved;
  }
});

test('lists are created in the active tab and can move to another tab', async () => {
  assert.equal(activeTabName(), 'Boulot');
  createListFromHeader('Refonte du site');
  assert.match($('#lists').textContent, /Refonte du site/);
  const list = state.state.lists.find(l => l.name === 'Refonte du site');
  assert.equal(list.tabId, state.findTab(state.state.activeTabId).id);

  // Each tab only shows its own lists.
  $$('#tabBar [data-action="tab"]')[0].click();
  assert.doesNotMatch($('#lists').textContent, /Refonte du site/);

  // Creating a list in another tab than the active one switches to that tab.
  $('header [data-action="new-list"]').click();
  assert.equal($('#lTabField').classList.contains('hidden'), false, 'the tab field is shown with several tabs');
  $('#lName').value = 'Réunions';
  $('#lTab').value = list.tabId;
  $('#lSubmit').click();
  assert.equal(activeTabName(), 'Boulot');

  // Editing a list can move it back to the first tab.
  $(`[data-action="edit-list"][data-id="${list.id}"]`).click();
  assert.equal($('#listModalTitle').textContent, 'Modifier la liste');
  assert.equal($('#lTab').value, list.tabId);
  $('#lTab').value = state.state.tabs[0].id;
  $('#lSubmit').click();
  assert.equal(toastText(), 'Liste déplacée dans « Mes listes »');
  assert.doesNotMatch($('#lists').textContent, /Refonte du site/);

  // Saving without changing the tab only renames.
  $$('#tabBar [data-action="tab"]')[0].click();
  $(`[data-action="edit-list"][data-id="${list.id}"]`).click();
  $('#lName').value = 'Refonte du site v2';
  $('#lSubmit').click();
  assert.equal(toastText(), 'Liste enregistrée');

  await settle();
  const saved = await serverState();
  const tabIdOf = name => saved.lists.find(l => l.name === name).tabId;
  assert.equal(tabIdOf('Refonte du site v2'), saved.tabs[0].id);
  assert.equal(tabIdOf('Réunions'), saved.tabs[1].id);
});

test('the tab manager renames tabs inline and refuses blank names', async () => {
  $('[data-action="manage-tabs"]').click();
  assert.ok(isOpen('tabsModal'));
  assert.equal($$('#tabsManager li').length, 2);
  assert.match(managerRow('Boulot').textContent, /1 liste/);

  changeValue(managerRow('Boulot').querySelector('input'), '  Mes listes boulot ');
  assert.deepEqual(tabNames(), ['Mes listes', 'Mes listes boulot']);
  assert.equal(toastText(), 'Onglet renommé');

  const input = managerRow('Mes listes').querySelector('input');
  changeValue(input, '   ');
  assert.equal(input.value, 'Mes listes', 'the previous name comes back');
  assert.equal(toastText(), 'Le nom de l’onglet ne peut pas être vide');

  // An unchanged name saves nothing.
  $('#toastText').textContent = '';
  changeValue(input, ' Mes listes ');
  assert.equal(toastText(), '');

  await settle();
  assert.deepEqual((await serverState()).tabs.map(t => t.name), ['Mes listes', 'Mes listes boulot']);
});

test('the tab manager moves tabs, keeps the focus and saves the order', async () => {
  const moveRight = () => managerRow('Mes listes').querySelector('[data-offset="1"]');
  assert.equal(managerRow('Mes listes').querySelector('[data-offset="-1"]').disabled, true, 'the first tab cannot go further left');

  moveRight().click();
  assert.deepEqual(tabNames(), ['Mes listes boulot', 'Mes listes']);
  // The pressed button is now disabled (last position): focus moves to the other arrow.
  const focused = dom.window.document.activeElement;
  assert.equal(focused.dataset.action, 'move-tab');
  assert.equal(focused.dataset.offset, '-1');
  assert.equal(focused.dataset.id, state.state.tabs[1].id);

  focused.click();
  assert.deepEqual(tabNames(), ['Mes listes', 'Mes listes boulot']);
  assert.equal(dom.window.document.activeElement.dataset.offset, '1', 'focus stays on the arrow that still works');

  managerRow('Mes listes').querySelector('[data-offset="1"]').click();
  await settle();
  assert.deepEqual((await serverState()).tabs.map(t => [t.name, t.position]), [['Mes listes boulot', 0], ['Mes listes', 1]]);
});

test('"Nouvel onglet" in the manager creates the tab, then reopens the manager', () => {
  $('#tabsModal [data-action="new-tab"]').click();
  assert.ok(isOpen('tabModal'));
  assert.equal(isOpen('tabsModal'), false);
  $('#tabName').value = 'Maison';
  $('#tabSubmit').click();
  assert.ok(isOpen('tabsModal'), 'back to the manager');
  assert.equal($$('#tabsManager li').length, 3);
  assert.equal(activeTabName(), 'Maison');
});

test('an empty tab is deleted at once, a tab with lists after confirmation', async () => {
  managerRow('Maison').querySelector('[data-action="del-tab"]').click();
  assert.equal(isOpen('confirmModal'), false, 'no confirmation for an empty tab');
  assert.deepEqual(tabNames(), ['Mes listes boulot', 'Mes listes']);
  assert.equal($$('#tabsManager li').length, 2, 'the manager is refreshed');
  assert.equal(activeTabName(), 'Mes listes', 'the neighbouring tab becomes active');
  assert.equal(toastText(), 'Onglet supprimé');

  // Give "Mes listes boulot" a task and an archived list.
  const boulot = state.state.tabs[0];
  const [list] = state.listsOfTab(boulot.id);
  state.state.tasks.push({
    id: 'uitask1', listId: list.id, name: 'Préparer le point', description: '', duration: 'h1',
    criticality: 2, status: 'todo', createdAt: 1, completedAt: null
  });
  state.state.lists.push({ id: 'uiarchived', tabId: boulot.id, name: 'Ancienne', archived: true, archivedAt: 1, createdAt: 1 });

  managerRow('Mes listes boulot').querySelector('[data-action="del-tab"]').click();
  assert.ok(isOpen('confirmModal'));
  assert.equal($('#cBody').textContent,
    '« Mes listes boulot » sera supprimé avec ses 2 listes et 1 tâche, historique compris. Cette action est définitive.');
  $('#cOk').click();
  assert.ok(isOpen('tabsModal'), 'the manager reopens after the deletion');
  assert.deepEqual(tabNames(), ['Mes listes']);
  assert.equal(state.state.lists.some(l => l.tabId === boulot.id), false);
  assert.equal(state.state.tasks.some(t => t.id === 'uitask1'), false);

  // The last tab cannot be deleted.
  const lastDelete = $('#tabsManager [data-action="del-tab"]');
  assert.equal(lastDelete.disabled, true);
  assert.equal(lastDelete.getAttribute('aria-label'), 'Impossible de supprimer le dernier onglet');
  lastDelete.disabled = false;
  lastDelete.click();
  assert.deepEqual(tabNames(), ['Mes listes'], 'deleting the last tab is ignored');
  $('#tabsModal [data-action="close-modal"]').click();

  await settle();
  const saved = await serverState();
  assert.deepEqual(saved.tabs.map(t => t.name), ['Mes listes']);
  assert.deepEqual(saved.lists.map(l => l.name), ['Refonte du site v2']);
  assert.deepEqual(saved.tasks, []);
});

test('double-clicking a header tab renames it', async () => {
  $('#tabBar [data-action="tab"]').dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  assert.ok(isOpen('tabModal'));
  assert.equal($('#tabModalTitle').textContent, 'Renommer l’onglet');
  assert.equal($('#tabName').value, 'Mes listes');
  $('#tabName').value = 'Perso';
  $('#tabSubmit').click();
  assert.deepEqual(tabNames(), ['Perso']);
  assert.equal(toastText(), 'Onglet renommé');
  assert.equal(isOpen('tabsModal'), false, 'the manager does not open after a header rename');

  // Clicks on unknown tabs are ignored.
  $('#tabBar').insertAdjacentHTML('beforeend', '<button data-action="tab" data-id="absent">X</button>');
  $('#tabBar [data-id="absent"]').dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  $('#tabBar [data-id="absent"]').click();
  assert.equal(isOpen('tabModal'), false);
  assert.equal(state.state.activeTabId, state.state.tabs[0].id);
  render.renderTabs();

  await settle();
  assert.deepEqual((await serverState()).tabs.map(t => t.name), ['Perso']);
});

test('history names the tab of archived lists only when there are several tabs', () => {
  const [list] = state.state.lists;
  list.archived = true;
  list.archivedAt = 1;
  $('#historyTab').click();
  assert.doesNotMatch($('#history').textContent, /Perso ·/);

  createTabFromHeader('Boulot');
  $('#historyTab').click();
  assert.match($('#history').textContent, /Perso · 0 tâche/);

  list.archived = false;
  list.archivedAt = null;
  $$('#tabBar [data-action="tab"]')[0].click();
});

test('the tab strip fades the edges that hide tabs and scrolls to the active tab', () => {
  const bar = $('#tabBar');
  const layout = (element, values) => {
    for (const [key, value] of Object.entries(values)) Object.defineProperty(element, key, { value, configurable: true });
  };

  layout(bar, { scrollWidth: 600, clientWidth: 200, scrollLeft: 0, offsetLeft: 0 });
  render.updateTabStripFade();
  assert.equal(bar.hasAttribute('data-fade-left'), false);
  assert.equal(bar.hasAttribute('data-fade-right'), true);

  layout(bar, { scrollLeft: 400 });
  bar.dispatchEvent(new dom.window.Event('scroll'));
  assert.equal(bar.hasAttribute('data-fade-left'), true);
  assert.equal(bar.hasAttribute('data-fade-right'), false);

  // The active tab sits outside the visible part of the strip: it is centred.
  const scrolls = [];
  layout(bar, { scrollLeft: 0, scrollTo: options => scrolls.push(options) });
  layout($('#tabBar [aria-current="page"]'), { offsetLeft: 500, offsetWidth: 100 });
  render.revealActiveTab();
  assert.deepEqual(scrolls, [{ left: 450, behavior: 'smooth' }]);

  // Already visible: no scrolling.
  layout(bar, { scrollLeft: 400 });
  render.revealActiveTab();
  assert.equal(scrolls.length, 1);

  // No selected tab (history view): nothing to reveal.
  $('#historyTab').click();
  render.revealActiveTab();
  assert.equal(scrolls.length, 1);
  $$('#tabBar [data-action="tab"]')[0].click();
});

test('"Tout effacer" keeps a single default tab', async () => {
  $('header [data-action="reset-all"]').click();
  assert.equal($('#cBody').textContent, 'Onglets, listes, tâches et historique seront remis à zéro.');
  $('#cOk').click();
  assert.deepEqual(tabNames(), ['Mes listes']);
  assert.equal(activeTabName(), 'Mes listes');

  await settle();
  const saved = await serverState();
  assert.deepEqual(saved.tabs.map(t => t.name), ['Mes listes']);
  assert.deepEqual(saved.lists, []);
});
