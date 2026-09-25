import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPreviewStore } from '../src/lib/useAudioPreview.js';

// `toggle()` calls the injected `play()` from inside a `Promise.resolve().then(...)`,
// so it lands one microtask after `toggle()` returns. Tests that call `resolveNext()`
// right after `toggle()` need to let that microtask run first.
const flush = () => Promise.resolve().then(() => {});

// A tiny fake "player": records what was asked to play/stop and lets a test
// resolve or reject a specific attempt on demand, so the stale-token rule can
// be exercised deterministically without any real Audio element.
function makeFakePlayer() {
  const calls = [];
  let pending = [];
  const stops = [];
  return {
    calls,
    stops,
    play: (key) => new Promise((resolve, reject) => {
      calls.push(key);
      pending.push({ key, resolve, reject });
    }),
    stop: () => stops.push(Date.now()),
    resolveNext(err) {
      const next = pending.shift();
      if (!next) throw new Error('no pending attempt to resolve');
      if (err) next.reject(err);
      else next.resolve();
    },
  };
}

test('toggle on a fresh key starts loading, then playing once play() resolves', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  const p = store.toggle('a.mp3');
  assert.equal(store.getSnapshot().loadingKey, 'a.mp3');
  assert.equal(store.getSnapshot().activeKey, null);

  await flush();
  player.resolveNext();
  await p;

  assert.equal(store.getSnapshot().loadingKey, null);
  assert.equal(store.getSnapshot().activeKey, 'a.mp3');
});

test('toggle on the already-active key stops it', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  const p = store.toggle('a.mp3');
  await flush();
  player.resolveNext();
  await p;
  assert.equal(store.getSnapshot().activeKey, 'a.mp3');

  await store.toggle('a.mp3');
  assert.equal(store.getSnapshot().activeKey, null);
  assert.equal(player.stops.length, 1);
});

test('toggling a new key while another is loading supersedes the first, whose stale settle is ignored', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  const first = store.toggle('a.mp3');
  const second = store.toggle('b.mp3');
  assert.equal(store.getSnapshot().loadingKey, 'b.mp3');

  // The stale first attempt resolves after being superseded -- must not flip
  // state back to "a.mp3 playing".
  await flush();
  player.resolveNext(); // settles 'a.mp3'
  await first;
  assert.equal(store.getSnapshot().activeKey, null, 'stale success must not win');
  assert.equal(store.getSnapshot().loadingKey, 'b.mp3');

  await flush();
  player.resolveNext(); // settles 'b.mp3'
  await second;
  assert.equal(store.getSnapshot().activeKey, 'b.mp3');
});

test('a stale rejection (AbortError-shaped or otherwise) never surfaces once superseded', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  const first = store.toggle('a.mp3');
  store.toggle('b.mp3');

  const err = new Error('aborted');
  err.name = 'AbortError';
  await flush();
  player.resolveNext(err); // the stale 'a.mp3' attempt fails

  // The promise for the stale attempt resolves (not rejects) once superseded.
  await assert.doesNotReject(first);
  assert.equal(store.getSnapshot().loadingKey, 'b.mp3');
});

test('a live (non-superseded) rejection clears state and rejects its own caller', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  const attempt = store.toggle('a.mp3');
  await flush();
  player.resolveNext(new Error('NotAllowedError'));
  await assert.rejects(attempt);
  assert.equal(store.getSnapshot().activeKey, null);
  assert.equal(store.getSnapshot().loadingKey, null);
});

test('mount registry: playback stops only when the last registration for the playing key is removed', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  const p = store.toggle('a.mp3');
  await flush();
  player.resolveNext();
  await p;

  store.register('a.mp3', 'row-1');
  store.register('a.mp3', 'row-2'); // e.g. two open sections showing the same beatmap
  assert.equal(store.registrationCount('a.mp3'), 2);

  store.unregister('a.mp3', 'row-1');
  assert.equal(store.getSnapshot().activeKey, 'a.mp3', 'still playing: one registration remains');

  store.unregister('a.mp3', 'row-2');
  assert.equal(store.getSnapshot().activeKey, null, 'last registration gone: playback stops');
  assert.equal(player.stops.length, 1);
});

test('unregistering a key that is not currently playing or loading is a no-op', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  store.register('a.mp3', 'row-1');
  store.unregister('a.mp3', 'row-1');
  assert.equal(store.getSnapshot().activeKey, null);
  assert.equal(player.stops.length, 0);
});

test('stop() is idempotent and only calls the player stop() when something was actually playing/loading', () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  store.stop();
  assert.equal(player.stops.length, 0);

  store.toggle('a.mp3');
  store.stop();
  assert.equal(player.stops.length, 1);
});

test('subscribe/notify: listeners fire on every state transition and unsubscribe stops delivery', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications += 1; });

  const p = store.toggle('a.mp3'); // -> loading
  await flush();
  player.resolveNext(); // -> playing
  await p;
  assert.ok(notifications >= 2);

  unsubscribe();
  const before = notifications;
  store.stop();
  assert.equal(notifications, before, 'no more notifications after unsubscribe');
});

test('toggle with no previewKey is a safe no-op', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  await store.toggle(null);
  await store.toggle(undefined);
  assert.equal(player.calls.length, 0);
  assert.equal(store.getSnapshot().activeKey, null);
});
