/**
 * Shared outbound HTTP client.
 *
 * Every fetch this app makes to somewhere else -- the osu! API, a scraped provider page,
 * a beatmap mirror, GitHub -- goes through here instead of a private `fetch` + its own
 * `AbortController`. That is what makes `.status`-tagged errors, a request timeout and a
 * byte cap apply everywhere at once instead of wherever someone remembered to add them.
 *
 * Server-only in practice: it is meant for route handlers and `src/lib` server modules,
 * never for a `'use client'` component. Nothing in here reaches into a client bundle
 * (`mirrors.js`, which the browser download helper does import, does not import this
 * module), so importing it does not itself break a client build -- but it is not designed
 * to run in a browser, and nothing should rely on it doing so.
 */

/**
 * The profile for each host is chosen once, in data (a mirror table's `uaProfile` field,
 * or an extractor's own constant) -- never as a per-host special case inside this module.
 */
export const UA_PROFILES = {
  server: 'osuSync/1.0 (+https://github.com/sidlikesgrapess/osu-playlist-sync)',
  // A current desktop browser UA, for scraped providers (Spotify's embed page, Apple
  // Music's public page) that answer differently, or refuse outright, to an obvious bot.
  browserLike:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
};

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** A caller-supplied signal aborts our own controller too, so both deadlines compose. */
function linkExternalSignal(external, controller) {
  if (!external) return;
  if (external.aborted) {
    controller.abort();
    return;
  }
  external.addEventListener('abort', () => controller.abort(), { once: true });
}

/**
 * Issue the request under a single deadline that covers however long the caller keeps
 * reading the response for (fetchText's stream included, not just the round trip to
 * headers). Non-2xx and timeout are both turned into `.status`-tagged errors here, so
 * every caller of `fetchText`/`fetchJson`/`fetchUpstream` sees the same two shapes.
 */
async function openRequest(url, { profile = 'server', timeoutMs = 8000, headers, signal } = {}) {
  const controller = new AbortController();
  linkExternalSignal(signal, controller);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA_PROFILES[profile] || UA_PROFILES.server, ...headers },
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!res.ok) {
      // Nobody reads an error body, and an unread one holds its connection until GC.
      await res.body?.cancel().catch(() => {});
      throw httpError(`Upstream responded ${res.status} for ${url}`, res.status);
    }
    return { res, controller, timer };
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted && !(err && err.status)) {
      throw httpError(`Timed out fetching ${url}`, 504);
    }
    throw err;
  }
}

/**
 * The raw Response, for a caller that streams the body itself (the download relay builds
 * its own byte-capped stream over this). No buffering and no byte cap happen in here --
 * once the response is handed back, this module's deadline no longer covers the body.
 */
export async function fetchUpstream(url, opts = {}) {
  const { res, timer } = await openRequest(url, opts);
  clearTimeout(timer);
  return res;
}

/**
 * The body as text, capped at `maxBytes` counted as bytes actually streamed in -- never
 * trusting `Content-Length`, which an upstream can omit or simply lie about.
 */
export async function fetchText(url, opts = {}) {
  const { maxBytes = 2_000_000 } = opts;
  const { res, controller, timer } = await openRequest(url, opts);

  try {
    if (!res.body) {
      const text = await res.text();
      if (Buffer.byteLength(text, 'utf8') > maxBytes) {
        throw httpError(`Response over ${maxBytes} bytes for ${url}`, 502);
      }
      return text;
    }

    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw httpError(`Response over ${maxBytes} bytes for ${url}`, 502);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  } catch (err) {
    if (controller.signal.aborted && !(err && err.status)) {
      throw httpError(`Timed out fetching ${url}`, 504);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** `fetchText` plus `JSON.parse`. A malformed body throws `JSON.parse`'s own SyntaxError. */
export async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  return JSON.parse(text);
}
