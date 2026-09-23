/**
 * Where beatmap bytes come from.
 *
 * Every .osz used to be pulled through /api/download, which streams the whole
 * archive out of a serverless function. Vercel bills that twice: once as origin
 * transfer (function to edge) and again as data transfer (edge to browser), and
 * the origin allowance is a tenth of the data one. A single batch over a large
 * playlist is measured in gigabytes, so the proxy was the entire bandwidth bill.
 *
 * The `BROWSER_MIRRORS` answer with `Access-Control-Allow-Origin: *`, so the
 * browser fetches the archive itself and Vercel never sees the bytes. The proxy
 * stays as the last resort for the `PROXY_MIRRORS`, which a page cannot read, and
 * for when a browser mirror is down.
 *
 * Client-safe. The imports are relative with extensions so `node --test` can load
 * this module as well as the Next bundler.
 */
import { BROWSER_MIRRORS } from './mirrors.js';
import { isValidArchiveBlob } from './archive.js';

export const proxyUrl = (beatmapsetId) => `/api/download?beatmapsetId=${beatmapsetId}`;

/**
 * How many maps may fall back to the proxy in one page session before the rest
 * are refused. It is per session, not per batch: two back to back batches during a
 * mirror outage would otherwise each get a fresh allowance. Single clicks pass no
 * budget and may always proxy.
 */
export const PROXY_FALLBACK_BUDGET = 5;

/** A fresh allowance. The page holds one in a ref for its whole session. */
export const createProxyBudget = () => ({ spent: 0 });

/**
 * The largest ZIP part. JSZip holds its inputs and its output at once, so peak
 * memory is about twice this. 500 MB peak stays under what iOS Safari allows a tab
 * in practice; 1 GB does not.
 */
export const MAX_ZIP_PART_BYTES = 250 * 1024 * 1024;

/**
 * Whether the next archive has to open a new part. A part that already holds
 * something is closed when `nextSize` would push it past `cap`; an empty part
 * always takes the archive, so one oversized map still gets saved on its own.
 */
export function shouldStartNewPart(partBytes, partCount, nextSize, cap = MAX_ZIP_PART_BYTES) {
  return partCount > 0 && partBytes + nextSize > cap;
}

/**
 * The polite gap between items in a batch. It starts at `minMs` and doubles each
 * time a mirror answers 429, up to `maxMs`. It never shrinks back within a batch:
 * a mirror that has asked us to slow down once is not hammered again. Our own
 * proxy's 429 does not feed it, and is never retried.
 */
export function createPacer({ minMs = 200, maxMs = 5000 } = {}) {
  let gap = minMs;
  return {
    get gapMs() {
      return gap;
    },
    noteMirror429() {
      gap = Math.min(maxMs, gap * 2);
    },
    /** Resolves after the current gap, or at once when `signal` aborts. */
    wait(signal) {
      return new Promise((resolve) => {
        if (signal?.aborted) {
          resolve();
          return;
        }
        const done = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', done);
          resolve();
        };
        const timer = setTimeout(done, gap);
        signal?.addEventListener('abort', done, { once: true });
      });
    },
  };
}

const abortError = () => new DOMException('Download cancelled', 'AbortError');

export const isAbortError = (err) => err?.name === 'AbortError';

/**
 * How long a request may go without progress before it is abandoned. The wait
 * is measured from the last sign of life, not from the start, so a large map on
 * a slow connection is never cut off while bytes are still arriving. Only a
 * silent connection is. The proxy gets a longer first wait because it walks its
 * mirrors server side, inside its 9 s deadline, before it answers at all.
 */
const MIRROR_TIMEOUTS = { firstByteMs: 10_000, stallMs: 15_000 };
const PROXY_TIMEOUTS = { firstByteMs: 15_000, stallMs: 15_000 };

/**
 * Fetch a URL into a Blob, aborting if the server stops responding or `signal`
 * aborts. Returns `{ blob }` on 2xx and `{ status }` otherwise. Throws on network
 * errors, CORS refusals and stalls, and throws an AbortError when `signal` did it.
 */
async function fetchBlob(url, { firstByteMs, stallMs }, signal) {
  if (signal?.aborted) throw abortError();

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  let timer = setTimeout(() => controller.abort(), firstByteMs);
  const keepAlive = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), stallMs);
  };

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      res.body?.cancel().catch(() => {});
      return { status: res.status };
    }
    keepAlive();

    if (!res.body) return { blob: await res.blob() };

    const reader = res.body.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      keepAlive();
    }
    return { blob: new Blob(chunks, { type: res.headers.get('content-type') || '' }) };
  } catch (err) {
    if (signal?.aborted) throw abortError();
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Fetch one .osz, preferring the mirrors the browser can read directly. Every
 * blob, from a mirror or from the proxy, has to pass `isValidArchiveBlob`.
 *
 * Returns `{ blob, mirror, viaProxy }`, or null when nothing served a real archive.
 * Throws an AbortError when `signal` aborts, and never reaches the proxy then:
 * a cancelled batch must not spend proxy bandwidth on its way out.
 */
export async function fetchBeatmapArchive(beatmapsetId, { budget = null, pacer = null, signal = null } = {}) {
  for (const mirror of BROWSER_MIRRORS) {
    try {
      const { blob, status } = await fetchBlob(mirror.url(beatmapsetId), MIRROR_TIMEOUTS, signal);
      if (status === 429) pacer?.noteMirror429();
      if (!blob || !(await isValidArchiveBlob(blob))) continue;

      return { blob, mirror: mirror.name, viaProxy: false };
    } catch (err) {
      if (isAbortError(err)) throw err;
      // CORS refusal, network error, a stall, or the mirror being down. Try the next one.
    }
  }

  if (signal?.aborted) throw abortError();
  if (budget && budget.spent >= PROXY_FALLBACK_BUDGET) return null;

  try {
    // Count the attempt, not the success: a proxy call that stalls halfway has
    // still pushed bytes through the function.
    if (budget) budget.spent += 1;
    // One attempt only. A 429 from our own route means this browser is over its
    // limit, and retrying would only extend that.
    const { blob } = await fetchBlob(proxyUrl(beatmapsetId), PROXY_TIMEOUTS, signal);
    if (!blob || !(await isValidArchiveBlob(blob))) return null;

    return { blob, mirror: 'proxy', viaProxy: true };
  } catch (err) {
    if (isAbortError(err)) throw err;
    return null;
  }
}
