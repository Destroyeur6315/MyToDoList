/**
 * Visual theme (light / dark), remembered per device.
 */

import { STORAGE_KEYS } from '../constants.js';
import { readStorage, writeStorage } from '../utils.js';
import { ICONS } from './icons.js';

const currentTheme = () => document.documentElement.getAttribute('data-theme');

/** @param {'light'|'dark'} theme */
export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  writeStorage(STORAGE_KEYS.theme, theme);
  // Each theme button (top bar and login screen) shows the theme you would switch to.
  document.querySelectorAll('.theme-icon').forEach(icon => {
    icon.innerHTML = theme === 'dark' ? ICONS.sun : ICONS.moon;
  });
}

export const toggleTheme = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark');

/** Applies the saved theme, or the OS preference on first visit. */
export function initTheme() {
  let theme = readStorage(STORAGE_KEYS.theme);
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  setTheme(theme);
}
