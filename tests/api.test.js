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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mytodolist-test-'));
const db = openDatabase(path.join(tmpDir, 'test.sqlite'));
let server;
let baseUrl;
/** Shifts the server clock used for session expiry (see the session tests). */
let clockOffsetMs = 0;

before(() => {
  server = createApp({ db, now: () => Date.now() + clockOffsetMs }).listen(0);
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

const sampleList = { id: 'liste1', name: 'Projet', archived: false, archivedAt: null, createdAt: 1234 };
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

  r = await call('/api/state', { method: 'PUT', cookie: alice, body: { revision: 0, lists: [sampleList], tasks: [sampleTask] } });
  assert.equal(r.status, 200);
  assert.equal(r.data.revision, 1);

  // Stale revision → conflict, nothing overwritten.
  r = await call('/api/state', { method: 'PUT', cookie: alice, body: { revision: 0, lists: [], tasks: [] } });
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
  assert.equal((await call('/api/state', { method: 'PUT', cookie, body: { lists, tasks: [], revision: 0 } })).status, 200);

  const r = await call('/api/lists', { method: 'POST', cookie, body: { name: 'Une de trop' } });
  assert.equal(r.status, 400);
  assert.equal((await call('/api/lists', { cookie })).data.length, 300);
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
