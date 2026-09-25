// The shared /api/osu/search pacer (todo item 08). Every test runs in fake time.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSearchPacer, pacedRequest, SEARCH_RATE } from '../src/lib/searchPacer.js';

/**
 * The route's limiter, rateLimit.js checkRateLimit, on an injected clock: a fixed window per
 * client that opens at its first request, counts every request (refused ones too) and
 * answers Retry-After as the time left in the window.
 */
function fixedWindowStub({ limit, windowMs, now }) {
  let entry = null;
  return {
    check() {
      const t = now();
      if (!entry || t - entry.windowStart >= windowMs) entry = { windowStart: t, count: 0 };
      entry.count += 1;
      if (entry.count > limit) {
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.windowStart + windowMs - t) / 1000)) };
      }
      return { allowed: true };
    },
  };
}

/** A fake clock whose sleep advances time. Sleeps are recorded. */
function fakeClock() {
  let t = 1_000_000;
  const sleeps = [];
  return {
    sleeps,
    now: () => t,
    sleep: async (ms) => { sleeps.push(ms); t += ms; },
    advance: (ms) => { t += ms; },
  };
}

/** The most grants any window of `windowMs` holds, over a sorted list of grant times. */
function maxInAnyWindow(times, windowMs) {
  let most = 0;
  for (let i = 0, j = 0; i < times.length; i++) {
    while (times[i] - times[j] >= windowMs) j++;
    most = Math.max(most, i - j + 1);
  }
  return most;
}

test('the default is 55 per 60 s, a little under the route limit of 60', () => {
  assert.deepEqual(SEARCH_RATE, { limit: 55, windowMs: 60_000 });
});

test('no 60 s window ever holds more than the limit', async () => {
  const clock = fakeClock();
  const pacer = createSearchPacer({ now: clock.now, sleep: clock.sleep });
  const times = [];
  await Promise.all(Array.from({ length: 200 }, () => pacer.acquire().then(() => times.push(clock.now()))));
  assert.equal(times.length, 200);
  assert.equal(maxInAnyWindow(times, 60_000), 55);
});

test('grants are handed out in call order', async () => {
  const clock = fakeClock();
  const pacer = createSearchPacer({ limit: 2, windowMs: 1000, now: clock.now, sleep: clock.sleep });
  const order = [];
  await Promise.all([0, 1, 2, 3, 4, 5].map((i) => pacer.acquire().then(() => order.push(i))));
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5]);
});

test('a caller over the limit waits for the window, and is never refused', async () => {
  const clock = fakeClock();
  const pacer = createSearchPacer({ limit: 3, windowMs: 60_000, now: clock.now, sleep: clock.sleep });
  const start = clock.now();
  for (let i = 0; i < 3; i++) assert.equal(await pacer.acquire(), true);
  assert.equal(clock.now(), start);
  assert.equal(await pacer.acquire(), true);
  assert.equal(clock.now() - start, 60_000);
  assert.deepEqual(clock.sleeps, [60_000]);
});

test('penalize holds every grant until the Retry-After has passed', async () => {
  const clock = fakeClock();
  const pacer = createSearchPacer({ now: clock.now, sleep: clock.sleep });
  await pacer.acquire();
  const at = clock.now();
  pacer.penalize(12);
  await pacer.acquire();
  assert.equal(clock.now() - at, 12_000);
  // a missing Retry-After still waits a second, never zero
  pacer.penalize(0);
  const at2 = clock.now();
  await pacer.acquire();
  assert.equal(clock.now() - at2, 1000);
});

test('a skipped caller spends no grant, and the queue behind it goes on', async () => {
  const clock = fakeClock();
  const pacer = createSearchPacer({ limit: 1, windowMs: 1000, now: clock.now, sleep: clock.sleep });
  const results = await Promise.all([
    pacer.acquire(),
    pacer.acquire({ shouldSkip: () => true }),
    pacer.acquire({ shouldSkip: () => { throw new Error('boom'); } }).catch(() => 'threw'),
    pacer.acquire(),
  ]);
  assert.deepEqual(results, [true, false, 'threw', true]);
  assert.equal(clock.now() - 1_000_000, 1000);
});

test('pacedRequest retries a 429 through the pacer, then gives the last answer', async () => {
  const clock = fakeClock();
  const pacer = createSearchPacer({ now: clock.now, sleep: clock.sleep });
  let sent = 0;
  const alwaysBusy = async () => { sent++; return { rateLimited: true, retryAfterSec: 5 }; };
  const out = await pacedRequest(pacer, alwaysBusy);
  assert.equal(sent, 4); // the first try and 3 retries
  assert.equal(out.rateLimited, true);

  sent = 0;
  const busyOnce = async () => (++sent === 1 ? { rateLimited: true, retryAfterSec: 2 } : { rateLimited: false, value: 'ok' });
  const at = clock.now();
  const ok = await pacedRequest(pacer, busyOnce);
  assert.equal(ok.value, 'ok');
  assert.ok(clock.now() - at >= 2000);

  // a wait longer than pacing can absorb is not retried at all
  sent = 0;
  const longWait = async () => { sent++; return { rateLimited: true, retryAfterSec: 600 }; };
  assert.equal((await pacedRequest(pacer, longWait)).rateLimited, true);
  assert.equal(sent, 1);

  assert.deepEqual(await pacedRequest(pacer, alwaysBusy, { shouldSkip: () => true }), { skipped: true });
});

/** Search All over `rows` rows, 3 at a time, through the pacer, against the route's limiter. */
async function simulateSearchAll({ rows, routeLimit }) {
  const clock = fakeClock();
  const pacer = createSearchPacer({ now: clock.now, sleep: clock.sleep });
  const limiter = fixedWindowStub({ limit: routeLimit, windowMs: 60_000, now: clock.now });
  let answered429 = 0;
  const outcomes = [];
  let next = 0;
  const send = async () => {
    clock.advance(300); // each search takes a while to answer
    const verdict = limiter.check();
    if (!verdict.allowed) answered429++;
    return verdict.allowed ? { rateLimited: false } : { rateLimited: true, retryAfterSec: verdict.retryAfterSec };
  };
  const worker = async () => {
    while (next < rows) {
      next++;
      outcomes.push(await pacedRequest(pacer, send));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { outcomes, answered429, elapsedMs: clock.now() - 1_000_000 };
}

test('a 500 row Search All against a 60/min fixed window ends with 0 rate-limited rows', async () => {
  const { outcomes, answered429, elapsedMs } = await simulateSearchAll({ rows: 500, routeLimit: 60 });
  assert.equal(outcomes.length, 500);
  assert.equal(outcomes.filter((o) => o.rateLimited).length, 0);
  assert.equal(answered429, 0);
  assert.ok(elapsedMs < 10 * 60_000, `took ${elapsedMs} ms`);
});

test('when the route is tighter than the pacer, its 429s are retried and still end at 0', async () => {
  const { outcomes, answered429 } = await simulateSearchAll({ rows: 200, routeLimit: 40 });
  assert.ok(answered429 > 0);
  assert.equal(outcomes.filter((o) => o.rateLimited).length, 0);
});
