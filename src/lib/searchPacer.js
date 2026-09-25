/**
 * Client side pacing for `/api/osu/search`.
 *
 * The route allows 60 requests per 60 s per client (a fixed window, rateLimit.js), and a
 * Search All over a 500 song playlist asks for 500. Firing them as fast as the pool of 3
 * allows used to end with most rows marked rate-limited. The pacer is a sliding window a
 * little under the route's limit: any 60 s span holds at most `limit` grants, so no fixed
 * window inside it can hold more either.
 *
 * Pure apart from the clock, which is injected (`now`, `sleep`) so tests run in fake time.
 * One pacer is shared by every caller in the page, so batches running at once draw on one
 * budget. Grants are FIFO: callers queue, and nobody is ever refused, only made to wait.
 */

export const SEARCH_RATE = { limit: 55, windowMs: 60_000 };

// A 429 is retried this many times through the pacer before the row keeps its Retry button,
// and never when the wait asked for is longer than this. The route's own window asks for at
// most 60 s; osu! upstream may ask for more, and a row then shows the error rather than hang.
export const SEARCH_RETRY = { maxRetries: 3, maxWaitSec: 90 };

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createSearchPacer({ limit = SEARCH_RATE.limit, windowMs = SEARCH_RATE.windowMs, now = Date.now, sleep = realSleep } = {}) {
  const grants = [];
  let blockedUntil = 0;
  let queue = Promise.resolve();

  /** How long until a grant is possible, or 0 when one is possible now. */
  const waitMs = () => {
    const t = now();
    while (grants.length > 0 && grants[0] <= t - windowMs) grants.shift();
    const windowWait = grants.length < limit ? 0 : grants[0] + windowMs - t;
    return Math.max(0, windowWait, blockedUntil - t);
  };

  return {
    /**
     * Resolves true once a request may be sent, in call order. `shouldSkip` is asked when
     * this caller reaches the front and after every wait; when it answers true the call
     * resolves false without spending a grant (the row it was for is gone).
     */
    acquire({ shouldSkip } = {}) {
      const turn = queue.then(async () => {
        for (;;) {
          if (shouldSkip?.()) return false;
          const wait = waitMs();
          if (wait === 0) {
            grants.push(now());
            return true;
          }
          await sleep(wait);
        }
      });
      // A throwing shouldSkip must not wedge the queue for everyone behind it.
      queue = turn.catch(() => {});
      return turn;
    },
    /** A 429 answered anyway: grant nothing more until its Retry-After has passed. */
    penalize(retryAfterSec) {
      blockedUntil = Math.max(blockedUntil, now() + Math.max(1, retryAfterSec || 0) * 1000);
    },
    /** Grants inside the current window. For tests. */
    get inWindow() {
      waitMs();
      return grants.length;
    },
  };
}

/**
 * One paced request, retried after a 429 for as long as pacing can absorb it. `send()` does
 * the request and resolves `{ rateLimited, retryAfterSec, ...anything }`; the last outcome
 * is returned, so a caller sees `rateLimited: true` only once the retries are spent or the
 * wait asked for is past `maxWaitSec`. Resolves `{ skipped: true }` when `shouldSkip` said
 * the request is no longer wanted.
 */
export async function pacedRequest(pacer, send, { shouldSkip, maxRetries = SEARCH_RETRY.maxRetries, maxWaitSec = SEARCH_RETRY.maxWaitSec } = {}) {
  for (let attempt = 0; ; attempt++) {
    if (!(await pacer.acquire({ shouldSkip }))) return { skipped: true };
    const outcome = await send();
    if (!outcome?.rateLimited) return outcome;
    const waitSec = Math.max(1, Number(outcome.retryAfterSec) || 0);
    pacer.penalize(waitSec);
    if (attempt >= maxRetries || waitSec > maxWaitSec) return outcome;
  }
}
