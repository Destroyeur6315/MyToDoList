/**
 * Short, non-blocking notification at the bottom of the screen.
 */

import { byId } from '../utils.js';

const DISPLAY_MS = 2200;
let hideTimer = null;

export function toast(message) {
  const element = byId('toast');
  byId('toastText').textContent = message;
  element.style.opacity = '1';
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { element.style.opacity = '0'; }, DISPLAY_MS);
}
