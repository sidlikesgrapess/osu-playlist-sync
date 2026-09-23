// F-39: the artist probe memo is an LRU with a cap, a TTL, and a much shorter TTL for a
// failed probe. Own file, so the module-level cache starts empty.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { probeOsuArtist, ARTIST_PROBE_CACHE } = await import('../src/lib/osu.js');

const realFetch = globalThis.fetch;
const realNow = Date.now;
let now = 1_000_000;
Date.now = () => now;
afterEach(() => { globalThis.fetch = realFetch; });

let calls = [];
let failing = false;
function install() {
  globalThis.fetch = async (url) => {
    const q = new URL(String(url)).searchParams.get('q');
    calls.push(q);
    if (failing) return new Response('slow down', { status: 429 });
    return Response.json({ beatmapsets: [] });
  };
}

test('the limits are the plan\'s: 200 entries, 30 minutes, 60 s for a failure', () => {
  assert.deepEqual(ARTIST_PROBE_CACHE, { max: 200, ttlMs: 30 * 60_000, failedTtlMs: 60_000 });
});

test('a repeat probe is free until the TTL runs out', async () => {
  install(); calls = []; failing = false;
  await probeOsuArtist('Ttl Artist', 'tok');
  await probeOsuArtist('Ttl Artist', 'tok');
  assert.equal(calls.length, 1);
  now += ARTIST_PROBE_CACHE.ttlMs - 1;
  await probeOsuArtist('Ttl Artist', 'tok');
  assert.equal(calls.length, 1);
  now += 2;
  await probeOsuArtist('Ttl Artist', 'tok');
  assert.equal(calls.length, 2);
});

test('a failed probe is remembered for 60 s only', async () => {
  install(); calls = []; failing = true;
  assert.equal(await probeOsuArtist('Busy Artist', 'tok'), null);
  assert.equal(await probeOsuArtist('Busy Artist', 'tok'), null);
  assert.equal(calls.length, 1, 'the rest of a batch is spared the same 429');
  now += ARTIST_PROBE_CACHE.failedTtlMs + 1;
  failing = false;
  const probe = await probeOsuArtist('Busy Artist', 'tok');
  assert.equal(calls.length, 2);
  assert.equal(probe.count, 0);
});

test('past 200 entries the least recently used is evicted', async () => {
  install(); calls = []; failing = false;
  now += ARTIST_PROBE_CACHE.ttlMs * 10; // everything cached earlier has expired
  await probeOsuArtist('Artist 0', 'tok');
  for (let i = 1; i < ARTIST_PROBE_CACHE.max; i += 1) await probeOsuArtist(`Artist ${i}`, 'tok');
  await probeOsuArtist('Artist 0', 'tok'); // touched: now the most recent
  assert.equal(calls.length, ARTIST_PROBE_CACHE.max);
  await probeOsuArtist('Artist new', 'tok'); // 201st key evicts the oldest, Artist 1
  calls = [];
  await probeOsuArtist('Artist 0', 'tok');
  assert.equal(calls.length, 0, 'recently used survives');
  await probeOsuArtist('Artist 1', 'tok');
  assert.equal(calls.length, 1, 'least recently used was evicted');
});

test.after(() => { Date.now = realNow; });
