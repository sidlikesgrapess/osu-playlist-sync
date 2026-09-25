/**
 * What counts as a real beatmap archive.
 *
 * One predicate, run on both download paths: the browser's direct mirror fetch and the
 * proxy's result. An `.osz` is a ZIP, so a real one starts with a local file header and
 * ends with an end of central directory record. Checking the head alone is not enough:
 * a body cut off halfway still starts with `PK\x03\x04`, and only the missing EOCD in the
 * tail gives it away.
 *
 * Client-safe: no Node imports.
 */

/** Anything smaller is an error page or a placeholder, never a playable set. */
export const MIN_ARCHIVE_BYTES = 10 * 1024;

/** The proxy refuses to relay more than this per request (F-01). */
export const MAX_PROXY_ARCHIVE_BYTES = 50 * 1024 * 1024;

/**
 * The EOCD record is 22 bytes plus a comment of at most 65535 bytes, so it always sits
 * inside the last 65557 bytes of a complete ZIP.
 */
export const EOCD_SEARCH_BYTES = 22 + 0xffff;

const LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];
const EOCD = [0x50, 0x4b, 0x05, 0x06];

/** True when `bytes` (a Uint8Array) starts with the ZIP local file header `PK\x03\x04`. */
export function hasZipHead(bytes) {
  if (!bytes || bytes.length < LOCAL_HEADER.length) return false;
  return LOCAL_HEADER.every((b, i) => bytes[i] === b);
}

/** True when `bytes` (the archive's tail, as a Uint8Array) contains `PK\x05\x06`. */
export function hasEocd(bytes) {
  if (!bytes) return false;
  for (let i = bytes.length - EOCD.length; i >= 0; i--) {
    if (bytes[i] === EOCD[0] && bytes[i + 1] === EOCD[1] && bytes[i + 2] === EOCD[2] && bytes[i + 3] === EOCD[3]) {
      return true;
    }
  }
  return false;
}

/**
 * The archive predicate: at least `MIN_ARCHIVE_BYTES`, a ZIP head, and an EOCD record in
 * the last `EOCD_SEARCH_BYTES`. Only the two slices are read, never the whole blob.
 */
export async function isValidArchiveBlob(blob) {
  if (!blob || typeof blob.size !== 'number' || blob.size < MIN_ARCHIVE_BYTES) return false;

  const head = new Uint8Array(await blob.slice(0, LOCAL_HEADER.length).arrayBuffer());
  if (!hasZipHead(head)) return false;

  const tail = new Uint8Array(await blob.slice(-EOCD_SEARCH_BYTES).arrayBuffer());
  return hasEocd(tail);
}
