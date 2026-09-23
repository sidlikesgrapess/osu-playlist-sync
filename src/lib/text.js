/**
 * Shared text helpers. Client-safe: no imports.
 *
 * `normalizeForComparison` is the same function as the private one in `src/lib/osu.js`, moved
 * here so the Apple extractor's title join (F-06) compares titles exactly the way the matcher
 * does. `osu.js` still has its own copy until matching-player switches it to this import; the
 * body is kept byte-identical so the two cannot disagree in the meantime.
 */

/**
 * Normalizes strings for loose comparison (removes punctuation, prefixes like 'the', and extra
 * spaces). Keeps any Unicode letter/number (not just a-z0-9) so CJK and other non-Latin titles
 * survive normalization instead of collapsing to an empty string that spuriously "matches" any
 * other empty string.
 */
export function normalizeForComparison(str = '') {
  return str
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
