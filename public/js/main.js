/**
 * Front-end entry point: wires every module, then restores the session.
 */

import { initActions } from './actions.js';
import { initAuth, lockApp, restoreSession, SESSION_EXPIRED_MESSAGE } from './auth.js';
import { initSync } from './sync.js';
import { initModals } from './ui/modals.js';
import { initTheme } from './ui/theme.js';
import { toast } from './ui/toast.js';

initTheme();
initSync({
  onError: err => toast(err.status === 409
    ? 'Conflit de synchronisation : rechargez pour récupérer les dernières données.'
    : 'Sauvegarde impossible : vérifiez votre connexion.'),
  onUnauthorized: () => lockApp(SESSION_EXPIRED_MESSAGE)
});
initModals();
initActions();
initAuth();
restoreSession();
