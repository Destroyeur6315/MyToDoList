/**
 * Inline SVG icons (Lucide-style paths, 24×24 viewBox).
 */

export const ICONS = Object.freeze({
  edit: "<path d='M12 20h9'/><path d='M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'/>",
  trash: "<path d='M3 6h18'/><path d='M8 6V4h8v2'/><path d='M19 6l-1 14H6L5 6'/>",
  plus: "<path d='M12 5v14M5 12h14'/>",
  check: "<path d='M20 6 9 17l-5-5'/>",
  bolt: "<path d='M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z'/>",
  undo: "<path d='M3 12a9 9 0 1 0 2.6-6.4'/><path d='M3 4v4h4'/>",
  eye: "<path d='M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z'/><circle cx='12' cy='12' r='3'/>",
  eyeOff: "<path d='M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.2'/>"
    + "<path d='M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6'/>"
    + "<path d='M9.9 9.9a3 3 0 0 0 4.2 4.2'/><path d='M2 2l20 20'/>",
  sun: "<circle cx='12' cy='12' r='4'/><path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'/>",
  moon: "<path d='M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'/>"
});

/**
 * Builds an `<svg>` string for one of the paths above.
 * @param {string} paths SVG inner markup (trusted constant, never user input).
 * @param {number} [size=15]
 * @param {string} [className]
 */
export const svgIcon = (paths, size = 15, className = '') =>
  `<svg width='${size}' height='${size}' class='${className}' viewBox='0 0 24 24' fill='none' stroke='currentColor'`
  + ` stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${paths}</svg>`;
