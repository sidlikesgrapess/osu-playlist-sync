/**
 * Filenames for saved beatmaps and bundles, and the Content-Disposition that carries one.
 *
 * The stem is sanitized and truncated on its own, and only then does the caller append
 * `.osz` or `.zip`, so a long title can never cut the extension off. Truncation counts
 * code points (`Array.from`), never UTF-16 units, so it can never split a surrogate pair
 * and hand `encodeURIComponent` a lone half that throws URIError.
 *
 * Client-safe: no Node imports.
 */

// Reserved on Windows or in a path, plus every C0 control character.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARS = /[\\/*?:"<>|\u0000-\u001f]/g;

/**
 * `Array.from` yields a surrogate half with no partner as its own element, so a lone half
 * (malformed input only, but it would still throw later) is caught per element. No
 * lookbehind regex for this: older Safari cannot parse one, and this module ships to the
 * browser.
 */
const isLoneSurrogate = (c) => c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff;

/** Makes `name` safe to save, then keeps at most `maxCodePoints` of it. No extension. */
export function sanitizeStem(name, { maxCodePoints = 150 } = {}) {
  return Array.from(String(name ?? '').replace(UNSAFE_CHARS, '_'))
    .slice(0, maxCodePoints)
    .map((c) => (isLoneSurrogate(c) ? '_' : c))
    .join('');
}

/** `<id> <artist> - <title>.osz`, the name every single and bundled download uses. */
export function osuFilename(id, artist, title) {
  return `${sanitizeStem(`${id} ${artist} - ${title}`)}.osz`;
}

/** RFC 5987 value encoding: `encodeURIComponent` leaves `'()*` alone, the RFC does not. */
function encodeRfc5987(value) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * An `attachment` Content-Disposition for `filename`, which it sanitizes itself: a plain
 * ASCII `filename=` for old clients plus `filename*=UTF-8''` for the real name.
 */
export function contentDisposition(filename) {
  const raw = String(filename ?? '');
  const dot = raw.lastIndexOf('.');
  const hasExt = dot > 0 && /^\.[A-Za-z0-9]{1,10}$/.test(raw.slice(dot));
  const name = hasExt
    ? `${sanitizeStem(raw.slice(0, dot))}${raw.slice(dot)}`
    : sanitizeStem(raw);

  const ascii = Array.from(name, (c) => (c >= ' ' && c <= '~' ? c : '_')).join('');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}
