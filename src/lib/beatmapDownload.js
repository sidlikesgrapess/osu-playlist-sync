/**
 * Where beatmap bytes come from.
 *
 * Every .osz used to be pulled through /api/download, which streams the whole
 * archive out of a serverless function. Vercel bills that twice: once as origin
 * transfer (function to edge) and again as data transfer (edge to browser), and
 * the origin allowance is a tenth of the data one. A single batch over a large
 * playlist is measured in gigabytes, so the proxy was the entire bandwidth bill.
 *
 * catboy.best and nerinyan both answer with `Access-Control-Allow-Origin: *`, so
 * the browser can fetch the archive itself and Vercel never sees the bytes. That
 * is the only change: the blob still arrives in memory exactly as before, so the
 * filename, the ZIP bundler and the progress UI are untouched.
 *
 * The proxy stays as the last resort. beatconnect pins its ACAO to someone else's
 * origin and sayobot sends none at all, so /api/download is still the only way to
 * reach those two, and it is still what answers when a mirror is down.
 */
const CORS_MIRRORS = [
  { name: 'catboy.best', url: (id) => `https://catboy.best/d/${id}` },
  { name: 'nerinyan.moe', url: (id) => `https://api.nerinyan.moe/d/${id}` },
];

/**
 * Mirrors sometimes answer 200 with a JSON error or an HTML notice instead of an
 * archive. Every real beatmapset carries audio and is far past this, so a short
 * body means the mirror did not actually serve the map.
 */
const MIN_ARCHIVE_BYTES = 10 * 1024;

export const proxyUrl = (beatmapsetId) => `/api/download?beatmapsetId=${beatmapsetId}`;

/**
 * How many maps in one batch may fall back to the proxy before the rest are
 * refused. Without this, a mirror outage silently turns a 200 map batch back into
 * 200 proxied downloads, which is the exact bill this module exists to avoid.
 * A short honest failure is the better outcome.
 */
export const PROXY_FALLBACK_BUDGET = 5;

/** A fresh per-batch allowance. Single downloads pass none and may always proxy. */
export const createProxyBudget = () => ({ spent: 0 });

/**
 * Fetch one .osz, preferring the mirrors the browser can read directly.
 * Returns { blob, mirror, viaProxy }, or null when nothing served it.
 */
export async function fetchBeatmapArchive(beatmapsetId, { budget = null } = {}) {
  for (const mirror of CORS_MIRRORS) {
    try {
      const res = await fetch(mirror.url(beatmapsetId));
      if (!res.ok) continue;

      const blob = await res.blob();
      if (blob.size < MIN_ARCHIVE_BYTES) continue;

      return { blob, mirror: mirror.name, viaProxy: false };
    } catch {
      // CORS refusal, network error, or the mirror being down. Try the next one.
    }
  }

  if (budget && budget.spent >= PROXY_FALLBACK_BUDGET) return null;

  try {
    const res = await fetch(proxyUrl(beatmapsetId));
    if (!res.ok) return null;

    const blob = await res.blob();
    if (budget) budget.spent += 1;

    return { blob, mirror: 'proxy', viaProxy: true };
  } catch {
    return null;
  }
}
