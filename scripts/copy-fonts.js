'use strict';

/**
 * Copies the self-hosted font files (Fontsource npm packages) into
 * `public/fonts/`, where `styles/main.css` references them.
 * Only the variable "wght" Latin / Latin-extended subsets are needed.
 *
 * Usage: `npm run build:fonts`
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TARGET_DIR = path.join(ROOT_DIR, 'public', 'fonts');

const FAMILIES = ['inter', 'sora'];
const SUBSETS = ['latin', 'latin-ext'];

fs.mkdirSync(TARGET_DIR, { recursive: true });

for (const family of FAMILIES) {
  const packageDir = path.dirname(require.resolve(`@fontsource-variable/${family}/package.json`));
  for (const subset of SUBSETS) {
    const file = `${family}-${subset}-wght-normal.woff2`;
    fs.copyFileSync(path.join(packageDir, 'files', file), path.join(TARGET_DIR, file));
  }
}

console.log(`Fonts copied to ${path.relative(ROOT_DIR, TARGET_DIR)}`);
