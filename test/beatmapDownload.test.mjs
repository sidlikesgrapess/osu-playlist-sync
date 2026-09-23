import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import JSZip from 'jszip';

import {
  createPacer,
  shouldStartNewPart,
  fetchBeatmapArchive,
  createProxyBudget,
  PROXY_FALLBACK_BUDGET,
  MAX_ZIP_PART_BYTES,
  proxyUrl,
} from '../src/lib/beatmapDownload.js';
import { BROWSER_MIRRORS } from '../src/lib/mirrors.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function archiveBytes() {
  const zip = new JSZip();
  zip.file('audio.mp3', randomBytes(32 * 1024));
  return zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
}

/** Stubs fetch with a url -> handler map and records every url asked for. */
function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(url);
    const handler = routes[url];
    if (!handler) throw new TypeError(`unexpected fetch ${url}`);
    return handler(init);
  };
  return calls;
}

const ID = 41823;
const [first, second] = BROWSER_MIRRORS.map((m) => m.url(ID));

test('the pacer starts at 200 ms, doubles on each mirror 429 and caps at 5 s', () => {
  const pacer = createPacer();
  assert.equal(pacer.gapMs, 200);
  const seen = [];
  for (let i = 0; i < 7; i++) {
    pacer.noteMirror429();
    seen.push(pacer.gapMs);
  }
  assert.deepEqual(seen, [400, 800, 1600, 3200, 5000, 5000, 5000]);
});

test('pacer.wait resolves at once when the batch is cancelled', async () => {
  const pacer = createPacer({ minMs: 60_000 });
  const controller = new AbortController();
  const started = Date.now();
  const waiting = pacer.wait(controller.signal);
  controller.abort();
  await waiting;
  assert.ok(Date.now() - started < 1000);
});

test('a ZIP part closes only when the next archive would overflow a non-empty part', () => {
  const MB = 1024 * 1024;
  assert.equal(MAX_ZIP_PART_BYTES, 250 * MB);
  assert.equal(shouldStartNewPart(0, 0, 400 * MB), false, 'an oversized map still goes into an empty part');
  assert.equal(shouldStartNewPart(200 * MB, 10, 50 * MB), false, 'exactly at the cap still fits');
  assert.equal(shouldStartNewPart(200 * MB, 10, 50 * MB + 1), true);
});

test('a mirror 429 slows the pacer and the next mirror serves the map', async () => {
  const bytes = await archiveBytes();
  const calls = stubFetch({
    [first]: () => new Response('slow down', { status: 429 }),
    [second]: () => new Response(bytes, { status: 200 }),
  });
  const pacer = createPacer();
  const result = await fetchBeatmapArchive(ID, { pacer });
  assert.equal(result.mirror, BROWSER_MIRRORS[1].name);
  assert.equal(result.viaProxy, false);
  assert.equal(pacer.gapMs, 400);
  assert.deepEqual(calls, [first, second]);
});

test('a truncated archive from every mirror falls to the proxy, whose 429 is never retried', async () => {
  const bytes = await archiveBytes();
  const truncated = bytes.subarray(0, Math.floor(bytes.length / 2));
  const calls = stubFetch({
    [first]: () => new Response(truncated, { status: 200 }),
    [second]: () => new Response(truncated, { status: 200 }),
    [proxyUrl(ID)]: () => new Response('{"error":"Too many requests"}', { status: 429 }),
  });
  const pacer = createPacer();
  const result = await fetchBeatmapArchive(ID, { pacer, budget: createProxyBudget() });
  assert.equal(result, null);
  assert.deepEqual(calls, [first, second, proxyUrl(ID)], 'the proxy is asked exactly once');
  assert.equal(pacer.gapMs, 200, 'our own 429 does not change mirror pacing');
});

test('a spent session budget refuses the proxy', async () => {
  const calls = stubFetch({
    [first]: () => new Response('down', { status: 503 }),
    [second]: () => new Response('down', { status: 503 }),
  });
  const budget = { spent: PROXY_FALLBACK_BUDGET };
  assert.equal(await fetchBeatmapArchive(ID, { budget }), null);
  assert.deepEqual(calls, [first, second]);
});

test('cancelling mid-fetch throws AbortError and never reaches the proxy', async () => {
  const controller = new AbortController();
  const calls = stubFetch({
    [first]: ({ signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        controller.abort();
      }),
  });
  await assert.rejects(
    fetchBeatmapArchive(ID, { signal: controller.signal, budget: createProxyBudget() }),
    { name: 'AbortError' },
  );
  assert.deepEqual(calls, [first]);
});

test('an already cancelled batch makes no request at all', async () => {
  const calls = stubFetch({});
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchBeatmapArchive(ID, { signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(calls, []);
});
