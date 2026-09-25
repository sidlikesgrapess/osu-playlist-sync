/**
 * Hover bounce preference.
 *
 * The bounce itself is pure CSS (globals.css, keyed off `html.osu-bounce`); this module only
 * owns the stored flag and the class. It is shared by the Navbar toggle and the inline boot
 * script in layout.js, which sets the class before first paint so a reload never flashes the
 * plain easing first. Off by default: a missing key means off, like `osu_sfx_enabled`.
 */

export const BOUNCE_STORAGE_KEY = 'osu_bounce_enabled';
export const BOUNCE_CLASS = 'osu-bounce';

// Reading `window.localStorage` itself throws when site data is blocked, so the storage is
// resolved inside each try rather than passed in by the caller. Tests pass a fake instead.
const resolveStorage = (storage) => (storage === undefined ? globalThis.localStorage : storage);

/** True only for a stored 'true'. A missing key, any other value, or a storage that throws is off. */
export function isBounceEnabled(storage) {
  try {
    return resolveStorage(storage)?.getItem(BOUNCE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persists the flag. A blocked storage is ignored; the class still applies for this visit. */
export function saveBounceEnabled(on, storage) {
  try {
    resolveStorage(storage)?.setItem(BOUNCE_STORAGE_KEY, String(Boolean(on)));
  } catch {}
}

/** Adds or removes the class on the root element (document.documentElement). */
export function applyBounceClass(root, on) {
  root?.classList?.toggle(BOUNCE_CLASS, Boolean(on));
}

// Runs inline in <head> before the body is parsed. Kept tiny and self-contained, since it
// cannot import anything; built from the constants above so the key cannot drift.
export const BOUNCE_BOOT_SCRIPT =
  `try{if(localStorage.getItem(${JSON.stringify(BOUNCE_STORAGE_KEY)})==='true')` +
  `document.documentElement.classList.add(${JSON.stringify(BOUNCE_CLASS)})}catch(e){}`;
