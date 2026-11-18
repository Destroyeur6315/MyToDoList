/**
 * Login / registration screen and account lifecycle.
 */

import { api } from './api.js';
import { startSessionWatch, stopSessionWatch } from './session.js';
import { replaceBoard, resetViewFilters } from './state.js';
import { flushSaves, hasPendingChanges, startSync, stopSync } from './sync.js';
import { byId } from './utils.js';
import { closeModals } from './ui/modals.js';
import { render } from './ui/render.js';
import { toast } from './ui/toast.js';

/** 'login' | 'register' */
let mode = 'login';

const AUTH_TEXTS = {
  login: {
    title: 'Connexion',
    subtitle: 'Retrouvez vos listes et vos quick wins.',
    submit: 'Se connecter',
    switchHint: 'Pas encore de compte ?',
    switchLabel: 'Créer un compte',
    autocomplete: 'current-password',
    minLength: 1
  },
  register: {
    title: 'Créer un compte',
    subtitle: 'Créez votre espace personnel en quelques secondes.',
    submit: 'Créer mon compte',
    switchHint: 'Déjà un compte ?',
    switchLabel: 'Se connecter',
    autocomplete: 'new-password',
    minLength: 12
  }
};

function showAuthError(message) {
  const element = byId('authError');
  element.textContent = message;
  element.hidden = !message;
}

/**
 * @param {'login'|'register'} newMode
 * @param {string} [message] Message kept in the error area (e.g. session expiry).
 */
function setAuthMode(newMode, message = '') {
  mode = newMode;
  const texts = AUTH_TEXTS[mode];
  byId('authTitle').textContent = texts.title;
  byId('authSubtitle').textContent = texts.subtitle;
  byId('authSubmit').textContent = texts.submit;
  byId('authSwitchHint').textContent = texts.switchHint;
  byId('authSwitch').textContent = texts.switchLabel;
  byId('authPassword').autocomplete = texts.autocomplete;
  byId('authPassword').minLength = texts.minLength;
  byId('passwordHelp').classList.toggle('hidden', mode !== 'register');
  showAuthError(message);
}

export const SESSION_EXPIRED_MESSAGE = 'Session expirée. Reconnectez-vous.';

/**
 * Message shown on the login screen when the session ends on its own.
 * @param {import('./session.js').ExpiryReason} reason
 * @param {number} idleTimeoutMs
 */
function expiryMessage(reason, idleTimeoutMs) {
  if (reason === 'idle') {
    const minutes = Math.max(1, Math.round(idleTimeoutMs / 60_000));
    return `Session fermée après ${minutes} min d'inactivité. Reconnectez-vous.`;
  }
  if (reason === 'lifetime') return 'Session expirée (durée maximale atteinte). Reconnectez-vous.';
  return SESSION_EXPIRED_MESSAGE;
}

/**
 * Loads the user's board and shows the application.
 * @param {{ username: string }} user
 * @param {{ expiresInMs: number, idleTimeoutMs: number }} session Timing sent by the server.
 */
async function enterApp(user, session) {
  stopSync();
  byId('accountLabel').textContent = user.username;

  const serverState = await api.getState();
  replaceBoard(serverState);
  startSync(serverState.revision);
  startSessionWatch(session, reason => expireSession(expiryMessage(reason, session.idleTimeoutMs)));

  resetViewFilters();
  byId('search').value = '';
  document.body.classList.remove('auth-locked');
  byId('authScreen').hidden = true;
  render();
}

/**
 * Hides the application, drops in-memory data and shows the login screen.
 * @param {string} [message] Explanation shown on the login screen.
 */
export function lockApp(message = '') {
  stopSessionWatch();
  stopSync();
  replaceBoard();
  closeModals();
  document.body.classList.add('auth-locked');
  byId('authScreen').hidden = false;
  byId('authPassword').value = '';
  showAuthError(message);
}

/** Ends a session that timed out, saving pending changes first if still possible. */
async function expireSession(message) {
  if (hasPendingChanges()) await flushSaves();
  lockApp(message);
  setAuthMode('login', message);
}

async function submitAuthForm(event) {
  event.preventDefault();
  const submit = byId('authSubmit');
  submit.disabled = true;
  showAuthError('');
  try {
    const credentials = { username: byId('authUsername').value.trim(), password: byId('authPassword').value };
    const { user, session } = mode === 'login' ? await api.login(credentials) : await api.register(credentials);
    await enterApp(user, session);
  } catch (err) {
    showAuthError(err.message);
  } finally {
    submit.disabled = false;
  }
}

async function logout() {
  // Never drop unsaved changes silently.
  if (hasPendingChanges() && !(await flushSaves())) {
    toast('Sauvegarde non terminée, réessayez la déconnexion.');
    return;
  }
  try {
    await api.logout();
  } catch (err) {
    toast(`Déconnexion impossible : ${err.message}`);
    return;
  }
  lockApp();
  setAuthMode('login');
}

/** Attaches the auth listeners (call once at startup). */
export function initAuth() {
  byId('authSwitch').addEventListener('click', () => setAuthMode(mode === 'login' ? 'register' : 'login'));
  byId('authForm').addEventListener('submit', submitAuthForm);
  byId('logoutBtn').addEventListener('click', logout);
}

/** Resumes an existing session, or shows the login screen. */
export async function restoreSession() {
  try {
    const { user, session } = await api.me();
    if (user) await enterApp(user, session);
    else lockApp();
  } catch {
    lockApp();
    showAuthError('Connexion au serveur impossible.');
  }
}
