'use strict';

/**
 * End-to-end API tests against a real server and a throw-away SQLite file.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openDatabase } = require('../src/db/database');
const { createApp } = require('../src/app');
const defaultConfig = require('../src/config');

/**
 * Production config, except that more registrations are allowed per hour:
 * the tests create one account per scenario from the same address.
 */
const config = {
  ...defaultConfig,
  authRateLimits: { ...defaultConfig.authRateLimits, register: { ...defaultConfig.authRateLimits.register, limit: 100 } }
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytodolist-test-'));
const db = openDatabase(path.join(tmpDir, 'test.sqlite'));
let server;
let baseUrl;
/** Shifts the server clock used for session expiry (see the session tests). */
let clockOffsetMs = 0;

before(() => {
  server = createApp({ db, config, now: () => Date.now() + clockOffsetMs }).listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Small HTTP client. Sends the CSRF header by default.
 * @returns {Promise<{ status: number, data: any, cookie: string | null }>}
 */
async function call(url, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(baseUrl + url, {
    method,
    headers: {
      'X-MyToDoList-Request': '1',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const setCookie = response.headers.get('set-cookie');
  return {
    status: response.status,
    data: response.status === 204 ? null : await response.json(),
    cookie: setCookie ? setCookie.split(';')[0] : null
  };
}

async function register(username) {
  const r = await call('/api/auth/register', { method: 'POST', body: { username, password: 'un-mot-de-passe-solide' } });
  assert.equal(r.status, 201);
  return r.cookie;
}

const sampleTab = { id: 'onglet1', name: 'Perso', createdAt: 1234 };
const sampleList = { id: 'liste1', tabId: 'onglet1', name: 'Projet', archived: false, archivedAt: null, createdAt: 1234 };
const sampleTask = {
  id: 'tache1', listId: 'liste1', name: 'Faire le point', description: '',
  duration: 'h1', criticality: 3, status: 'doing', createdAt: 1234, completedAt: null
};

test('authentication, per-user isolation, snapshot saves and logout', async () => {
  assert.equal((await call('/api/state')).status, 401);

  const alice = await register('alice');
  let r = await call('/api/state', { cookie: alice });
  assert.equal(r.data.revision, 0);
  assert.deepEqual(r.data.lists, []);
  assert.equal(r.data.tabs.length, 1, 'every account starts with one tab');
  assert.equal(r.data.tabs[0].name, 'Mes listes');

  r = await call('/api/state', {
    method: 'PUT', cookie: alice, body: { revision: 0, tabs: [sampleTab], lists: [sampleList], tasks: [sampleTask] }
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.revision, 1);

  // Stale revision → conflict, nothing overwritten.
  r = await call('/api/state', { method: 'PUT', cookie: alice, body: { revision: 0, tabs: [sampleTab], lists: [], tasks: [] } });
  assert.equal(r.status, 409);
  r = await call('/api/tasks', { cookie: alice });
  assert.equal(r.data[0].status, 'doing');

  // Another user sees nothing and cannot touch Alice's data.
  const bob = await register('bob');
  r = await call('/api/state', { cookie: bob });
  assert.deepEqual(r.data.tasks, []);
  assert.equal((await call('/api/lists/liste1', { method: 'DELETE', cookie: bob })).status, 404);

  // Logout revokes the session server-side.
  assert.equal((await call('/api/auth/logout', { method: 'POST', cookie: alice })).status, 200);
  assert.equal((await call('/api/state', { cookie: alice })).status, 401);

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'alice', password: 'un-mot-de-passe-solide' } });
  assert.equal(r.status, 200);
  r = await call('/api/state', { cookie: r.cookie });
  assert.equal(r.data.tasks.length, 1);
});

test('registration and login errors', async () => {
  await register('carol');
  let r = await call('/api/auth/register', { method: 'POST', body: { username: 'CAROL', password: 'un-mot-de-passe-solide' } });
  assert.equal(r.status, 409, 'usernames are case-insensitive');

  r = await call('/api/auth/register', { method: 'POST', body: { username: 'dave', password: 'court' } });
  assert.equal(r.status, 400);

  r = await call('/api/auth/login', { method: 'POST', body: { username: 'carol', password: 'mauvais-mot-de-passe' } });
  assert.equal(r.status, 401);
  r = await call('/api/auth/login', { method: 'POST', body: { username: 'inconnu', password: 'peu-importe-ici' } });
  assert.equal(r.status, 401);
});

test('failed logins are limited per address and username, without global account lockout', async () => {
  const attempt = username =>
    call('/api/auth/login', { method: 'POST', body: { username, password: 'mauvais-mot-de-passe' } });
  for (let i = 0; i < 5; i++) assert.equal((await attempt('cible')).status, 401);
  assert.equal((await attempt('CIBLE')).status, 429, 'usernames are compared case-insensitively');
  assert.equal((await attempt('autre-compte')).status, 401, 'other accounts are not affected');
});

test('legacy password hashes still work and are upgraded at login', async () => {
  const { scryptSync } = require('node:crypto');
  const salt = 'ab'.repeat(16);
  const legacyHash = `scrypt:${salt}:${scryptSync('ancien-mot-de-passe', salt, 64).toString('hex')}`;
  db.prepare('INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
    .run('legacyuser1', 'ancien', legacyHash, 1);
  db.prepare('INSERT INTO metadata (user_id) VALUES (?)').run('legacyuser1');

  const r = await call('/api/auth/login', { method: 'POST', body: { username: 'ancien', password: 'ancien-mot-de-passe' } });
  assert.equal(r.status, 200);
  const { password_hash: stored } = db.prepare('SELECT password_hash FROM users WHERE id = ?').get('legacyuser1');
  assert.match(stored, /^scrypt:131072:8:1:/);
});

test('per-account quotas also apply to single creations', async () => {
  const cookie = await register('heidi');
  const lists = Array.from({ length: 300 }, (_, i) => ({ ...sampleList, id: `l${i}` }));
  const tabs = Array.from({ length: 20 }, (_, i) => ({ ...sampleTab, id: i ? `t${i}` : sampleTab.id }));
  assert.equal((await call('/api/state', { method: 'PUT', cookie, body: { tabs, lists, tasks: [], revision: 0 } })).status, 200);

  let r = await call('/api/lists', { method: 'POST', cookie, body: { name: 'Une de trop' } });
  assert.equal(r.status, 400);
  assert.equal((await call('/api/lists', { cookie })).data.length, 300);

  r = await call('/api/tabs', { method: 'POST', cookie, body: { name: 'Un de trop' } });
  assert.equal(r.status, 400);
  assert.equal((await call('/api/tabs', { cookie })).data.length, 20);
});

test('sessions expire after 30 min of inactivity and 10 h after login', async () => {
  const MINUTE = 60 * 1000;
  const login = async () => (await call('/api/auth/login', {
    method: 'POST', body: { username: 'ivan', password: 'un-mot-de-passe-solide' }
  })).cookie;
  const isLoggedIn = async cookie => (await call('/api/state', { cookie })).status === 200;

  try {
    let cookie = await register('ivan');
    const { data } = await call('/api/auth/me', { cookie });
    assert.equal(data.session.idleTimeoutMs, 30 * MINUTE);
    assert.ok(Math.abs(data.session.expiresInMs - 600 * MINUTE) < MINUTE, 'absolute lifetime of 10 h');

    // Each request resets the inactivity timer…
    clockOffsetMs += 29 * MINUTE;
    assert.ok(await isLoggedIn(cookie));
    clockOffsetMs += 29 * MINUTE;
    assert.ok(await isLoggedIn(cookie));
    // …but 30 min without any request ends the session for good.
    clockOffsetMs += 30 * MINUTE;
    assert.equal((await call('/api/state', { cookie })).status, 401);
    clockOffsetMs = 0;
    assert.equal((await call('/api/auth/me', { cookie })).data.user, null, 'expired sessions are deleted');

    // Even a constantly active session ends 10 h after login.
    cookie = await login();
    for (let elapsed = 25; elapsed < 600; elapsed += 25) {
      clockOffsetMs = elapsed * MINUTE;
      assert.ok(await isLoggedIn(cookie), `still valid after ${elapsed} min`);
    }
    clockOffsetMs = 600 * MINUTE;
    assert.equal((await call('/api/state', { cookie })).status, 401);
  } finally {
    clockOffsetMs = 0;
  }
});

test('databases from older versions are migrated (sessions.last_seen_at)', () => {
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(tmpDir, 'legacy.sqlite');
  const legacy = new DatabaseSync(file);
  legacy.exec('CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)');
  legacy.close();

  const migrated = openDatabase(file);
  const columns = migrated.prepare('PRAGMA table_info(sessions)').all().map(column => column.name);
  migrated.close();
  assert.ok(columns.includes('last_seen_at'));
});

test('databases from older versions are migrated (lists without tabs get a default tab)', () => {
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(tmpDir, 'legacy-tabs.sqlite');
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE lists (id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, archived_at INTEGER, created_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, id));
    INSERT INTO users VALUES ('u1', 'ancienne', 'x', 1), ('u2', 'sans-liste', 'x', 1);
    INSERT INTO lists (id, user_id, name, created_at) VALUES ('a', 'u1', 'A', 1), ('b', 'u1', 'B', 2);
  `);
  legacy.close();

  const migrated = openDatabase(file);
  const tabsOf = userId => migrated.prepare('SELECT id, name FROM tabs WHERE user_id = ?').all(userId);
  const [tab] = tabsOf('u1');
  assert.equal(tabsOf('u1').length, 1);
  assert.equal(tab.name, 'Mes listes');
  assert.match(tab.id, /^[0-9a-f]{32}$/);
  assert.equal(tabsOf('u2').length, 1, 'users without lists get a tab too');
  const listTabs = migrated.prepare("SELECT DISTINCT tab_id AS tabId FROM lists WHERE user_id = 'u1'").all();
  assert.deepEqual(listTabs.map(l => l.tabId), [tab.id]);
  migrated.close();

  // Opening the database again changes nothing (idempotent migration).
  const reopened = openDatabase(file);
  assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM tabs').get().count, 2);
  reopened.close();
});

test('mutations require the CSRF header and a same-origin Origin', async () => {
  const cookie = await register('erin');
  let r = await call('/api/lists', { method: 'POST', cookie, body: { name: 'X' }, headers: { 'X-MyToDoList-Request': '' } });
  assert.equal(r.status, 403);
  r = await call('/api/lists', { method: 'POST', cookie, body: { name: 'X' }, headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('REST routes: validation, update, cascade delete and revision bump', async () => {
  const cookie = await register('frank');

  let r = await call('/api/lists', { method: 'POST', cookie, body: { name: '  Courses  ' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.name, 'Courses');
  const listId = r.data.id;

  r = await call('/api/tasks', { method: 'POST', cookie, body: { ...sampleTask, listId, criticality: 9 } });
  assert.equal(r.status, 400);
  r = await call('/api/tasks', { method: 'POST', cookie, body: { ...sampleTask, listId: 'absente' } });
  assert.equal(r.status, 404);

  r = await call('/api/tasks', { method: 'POST', cookie, body: { ...sampleTask, listId } });
  assert.equal(r.status, 201);
  const taskId = r.data.id;

  r = await call(`/api/tasks/${taskId}`, { method: 'PATCH', cookie, body: { status: 'done' } });
  assert.equal(r.status, 200);
  assert.ok(r.data.completedAt > 0, 'finishing a task sets completedAt');

  r = await call(`/api/lists/${listId}`, { method: 'PATCH', cookie, body: { archived: true, archivedAt: 42 } });
  assert.equal(r.data.archived, true);

  assert.equal((await call(`/api/lists/${listId}`, { method: 'DELETE', cookie })).status, 204);
  r = await call('/api/state', { cookie });
  assert.deepEqual(r.data.tasks, [], 'tasks are deleted with their list');
  assert.equal(r.data.revision, 5);
});

test('tab routes: create, rename, reorder and per-user isolation', async () => {
  const cookie = await register('judy');
  const [first] = (await call('/api/tabs', { cookie })).data;
  assert.equal(first.position, 0);

  let r = await call('/api/tabs', { method: 'POST', cookie, body: { name: '  Boulot ' } });
  assert.equal(r.status, 201);
  assert.deepEqual([r.data.name, r.data.position], ['Boulot', 1], 'new tabs are appended on the right');
  const work = r.data.id;
  const third = (await call('/api/tabs', { method: 'POST', cookie, body: { name: 'Sport' } })).data.id;

  assert.equal((await call('/api/tabs', { method: 'POST', cookie, body: { name: ' ' } })).status, 400);

  // Moving "Sport" to the far left shifts the others to the right.
  r = await call(`/api/tabs/${third}`, { method: 'PATCH', cookie, body: { position: 0, name: 'Sport & santé' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.name, 'Sport & santé');
  r = await call('/api/tabs', { cookie });
  assert.deepEqual(r.data.map(t => [t.id, t.position]), [[third, 0], [first.id, 1], [work, 2]]);

  // A position past the end moves the tab to the far right.
  await call(`/api/tabs/${third}`, { method: 'PATCH', cookie, body: { position: 99 } });
  assert.deepEqual((await call('/api/tabs', { cookie })).data.map(t => t.id), [first.id, work, third]);
  assert.equal((await call(`/api/tabs/${third}`, { method: 'PATCH', cookie, body: { position: -1 } })).status, 400);

  // Another user can neither see nor change these tabs.
  const mallory = await register('mallory');
  assert.equal((await call('/api/tabs', { cookie: mallory })).data.length, 1);
  assert.equal((await call(`/api/tabs/${work}`, { method: 'PATCH', cookie: mallory, body: { name: 'X' } })).status, 404);
  assert.equal((await call(`/api/tabs/${work}`, { method: 'DELETE', cookie: mallory })).status, 404);
  assert.equal((await call('/api/lists', { method: 'POST', cookie: mallory, body: { name: 'X', tabId: work } })).status, 404);
  assert.equal((await call('/api/tabs', { method: 'POST', body: { name: 'X' } })).status, 401);
});

test('lists belong to a tab, and deleting a tab deletes its lists and tasks', async () => {
  const cookie = await register('ken');
  const [home] = (await call('/api/tabs', { cookie })).data;
  const work = (await call('/api/tabs', { method: 'POST', cookie, body: { name: 'Boulot' } })).data;

  // Without tabId, a list goes to the leftmost tab.
  let r = await call('/api/lists', { method: 'POST', cookie, body: { name: 'Maison' } });
  assert.equal(r.data.tabId, home.id);
  const homeList = r.data.id;
  r = await call('/api/lists', { method: 'POST', cookie, body: { name: 'Projet', tabId: work.id } });
  assert.equal(r.data.tabId, work.id);
  const workList = r.data.id;
  assert.equal((await call('/api/lists', { method: 'POST', cookie, body: { name: 'X', tabId: 'absent' } })).status, 404);

  await call('/api/tasks', { method: 'POST', cookie, body: { ...sampleTask, listId: workList } });
  // An archived list of the tab is deleted too.
  r = await call('/api/lists', { method: 'POST', cookie, body: { name: 'Ancien', tabId: work.id } });
  await call(`/api/lists/${r.data.id}`, { method: 'PATCH', cookie, body: { archived: true, archivedAt: 1 } });

  // Lists can move to another tab, but not to an unknown one.
  assert.equal((await call(`/api/lists/${homeList}`, { method: 'PATCH', cookie, body: { tabId: 'absent' } })).status, 404);
  r = await call(`/api/lists/${homeList}`, { method: 'PATCH', cookie, body: { tabId: work.id } });
  assert.equal(r.data.tabId, work.id);
  await call(`/api/lists/${homeList}`, { method: 'PATCH', cookie, body: { tabId: home.id } });

  assert.equal((await call(`/api/tabs/${work.id}`, { method: 'DELETE', cookie })).status, 204);
  r = await call('/api/state', { cookie });
  assert.deepEqual(r.data.tabs.map(t => [t.id, t.position]), [[home.id, 0]]);
  assert.deepEqual(r.data.lists.map(l => l.id), [homeList]);
  assert.deepEqual(r.data.tasks, []);

  // The last tab cannot be deleted.
  r = await call(`/api/tabs/${home.id}`, { method: 'DELETE', cookie });
  assert.equal(r.status, 400);
  assert.equal((await call('/api/tabs', { cookie })).data.length, 1);
  assert.equal((await call('/api/tabs/absent', { method: 'DELETE', cookie })).status, 404);
});

test('snapshots save the tab order and reject lists of unknown tabs', async () => {
  const cookie = await register('leo');
  const tabs = [{ ...sampleTab, id: 'b', name: 'B' }, { ...sampleTab, id: 'a', name: 'A' }];
  let r = await call('/api/state', { method: 'PUT', cookie, body: { revision: 0, tabs, lists: [{ ...sampleList, tabId: 'a' }], tasks: [] } });
  assert.equal(r.status, 200);
  r = await call('/api/state', { cookie });
  assert.deepEqual(r.data.tabs.map(t => [t.id, t.position]), [['b', 0], ['a', 1]]);
  assert.equal(r.data.lists[0].tabId, 'a');

  r = await call('/api/state', { method: 'PUT', cookie, body: { revision: 1, tabs, lists: [{ ...sampleList, tabId: 'c' }], tasks: [] } });
  assert.equal(r.status, 400);
  r = await call('/api/state', { method: 'PUT', cookie, body: { revision: 1, tabs: [], lists: [], tasks: [] } });
  assert.equal(r.status, 400, 'an account keeps at least one tab');
});

test('unknown API routes and malformed JSON', async () => {
  const cookie = await register('grace');
  assert.equal((await call('/api/nope', { cookie })).status, 404);

  const response = await fetch(`${baseUrl}/api/lists`, {
    method: 'POST',
    headers: { 'X-MyToDoList-Request': '1', 'Content-Type': 'application/json', Cookie: cookie },
    body: '{ pas du json'
  });
  assert.equal(response.status, 400);
});
