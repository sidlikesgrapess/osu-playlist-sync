/**
 * Shared text helpers. Client-safe: no imports.
 *
 * `normalizeForComparison` is the matcher's own normalizer: `src/lib/osu.js` imports it from
 * here, so the Apple extractor's title join (F-06) compares titles exactly the way the matcher
 * does.
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
