import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createPreviewStore, createAudioBackend } from '../src/lib/useAudioPreview.js';

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

// --- Buffering and error state (todo 03). The browser instance feeds `setBuffering` from the
// audio element's waiting/stalled/playing events and `fail` from its error event. ---

async function startPlaying(store, player, key) {
  const p = store.toggle(key);
  await flush();
  player.resolveNext();
  await p;
}

test('loading is not an error, and a fresh key has no buffering or error flags', () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  store.toggle('a.mp3');
  const snap = store.getSnapshot();
  assert.equal(snap.loadingKey, 'a.mp3');
  assert.equal(snap.bufferingKey, null);
  assert.equal(snap.errorKeys.has('a.mp3'), false);
});

test('mid play waiting then playing toggles bufferingKey without touching activeKey', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });
  await startPlaying(store, player, 'a.mp3');

  store.setBuffering('a.mp3', true);
  assert.equal(store.getSnapshot().bufferingKey, 'a.mp3');
  assert.equal(store.getSnapshot().activeKey, 'a.mp3');

  store.setBuffering('a.mp3', false);
  assert.equal(store.getSnapshot().bufferingKey, null);
  assert.equal(store.getSnapshot().activeKey, 'a.mp3');
});

test('fail after playback began stops once, clears state and flags the key', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });
  await startPlaying(store, player, 'a.mp3');
  store.setBuffering('a.mp3', true);

  store.fail('a.mp3');
  const snap = store.getSnapshot();
  assert.equal(snap.activeKey, null);
  assert.equal(snap.loadingKey, null);
  assert.equal(snap.bufferingKey, null);
  assert.equal(snap.errorKeys.has('a.mp3'), true);
  assert.equal(player.stops.length, 1);

  store.fail('a.mp3'); // a second error event for the same, now stopped, src
  assert.equal(player.stops.length, 1);
});

test('fail during loading flags the key and the superseded play() settle is swallowed', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  const attempt = store.toggle('a.mp3');
  await flush();
  store.fail('a.mp3'); // the element's error event fires before play() rejects
  player.resolveNext(new Error('NotSupportedError'));
  await assert.doesNotReject(attempt);
  assert.equal(store.getSnapshot().errorKeys.has('a.mp3'), true);
  assert.equal(store.getSnapshot().loadingKey, null);
});

test('events for a superseded or stopped key are ignored', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });
  await startPlaying(store, player, 'a.mp3');
  store.toggle('b.mp3'); // a.mp3 replaced by b.mp3, still loading

  store.fail('a.mp3');
  store.setBuffering('a.mp3', true);
  const snap = store.getSnapshot();
  assert.equal(snap.loadingKey, 'b.mp3');
  assert.equal(snap.bufferingKey, null);
  assert.equal(snap.errorKeys.has('a.mp3'), false);

  store.stop();
  const stopsBefore = player.stops.length;
  store.fail('b.mp3');
  assert.equal(store.getSnapshot().errorKeys.has('b.mp3'), false);
  assert.equal(player.stops.length, stopsBefore);
});

test('a live play() rejection flags the key, and toggling it again clears the flag and retries', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });

  const attempt = store.toggle('a.mp3');
  await flush();
  player.resolveNext(new Error('network'));
  await assert.rejects(attempt);
  assert.equal(store.getSnapshot().errorKeys.has('a.mp3'), true);

  const retry = store.toggle('a.mp3');
  assert.equal(store.getSnapshot().errorKeys.has('a.mp3'), false, 'the retry clears the error');
  assert.equal(store.getSnapshot().loadingKey, 'a.mp3');
  await flush();
  player.resolveNext();
  await retry;
  assert.equal(store.getSnapshot().activeKey, 'a.mp3');
  assert.equal(player.calls.length, 2);
});

test('an error on one key survives another key playing', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });
  await startPlaying(store, player, 'a.mp3');
  store.fail('a.mp3');
  await startPlaying(store, player, 'b.mp3');

  assert.equal(store.getSnapshot().errorKeys.has('a.mp3'), true);
  assert.equal(store.getSnapshot().activeKey, 'b.mp3');
});

test('no-op events keep the snapshot reference and send no notification', async () => {
  const player = makeFakePlayer();
  const store = createPreviewStore({ play: player.play, stop: player.stop });
  await startPlaying(store, player, 'a.mp3');

  let notifications = 0;
  store.subscribe(() => { notifications += 1; });
  const before = store.getSnapshot();

  store.setBuffering('a.mp3', false); // already not buffering
  store.setBuffering('z.mp3', true); // not the current key
  store.fail('z.mp3');
  assert.equal(store.getSnapshot(), before);
  assert.equal(notifications, 0);

  store.setBuffering('a.mp3', true);
  assert.notEqual(store.getSnapshot(), before, 'a real change replaces the snapshot');
  const buffering = store.getSnapshot();
  store.setBuffering('a.mp3', true);
  assert.equal(store.getSnapshot(), buffering);
});

// --- createAudioBackend: the browser wiring, against a fake media element. ---

// Mimics the parts of HTMLMediaElement the backend touches. `play()` stays pending until the
// test settles it; clearing src + load() rejects a pending play with AbortError, the way a
// real element does.
function makeFakeAudio() {
  const log = [];
  let srcAttr = null;
  let pending = null;
  const el = {
    log,
    volume: 1,
    readyState: 0,
    onended: null, onwaiting: null, onstalled: null, onplaying: null, onerror: null,
    get src() { return srcAttr ?? ''; },
    set src(v) { srcAttr = v; log.push(`src=${v}`); },
    hasAttribute: (name) => name === 'src' && srcAttr !== null,
    getAttribute: (name) => (name === 'src' ? srcAttr : null),
    removeAttribute: (name) => { if (name === 'src') srcAttr = null; log.push(`remove:${name}`); },
    pause: () => log.push('pause'),
    load: () => {
      log.push('load');
      if (pending) { const p = pending; pending = null; p.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }
    },
    play: () => new Promise((resolve, reject) => { log.push('play'); pending = { resolve, reject }; }),
    resolvePlay() { const p = pending; pending = null; p.resolve(); },
  };
  return el;
}

function makeBrowserStore() {
  const audio = makeFakeAudio();
  let created = 0;
  let store;
  const backend = createAudioBackend(() => { created += 1; return audio; }, () => store);
  store = createPreviewStore(backend);
  return { store, audio, createdCount: () => created };
}

const HANDLERS = ['onended', 'onwaiting', 'onstalled', 'onplaying', 'onerror'];

test('backend: stop after play releases the media (no src, load() called, handlers null)', async () => {
  const { store, audio } = makeBrowserStore();
  const p = store.toggle('a.mp3');
  await flush();
  assert.equal(audio.getAttribute('src'), 'a.mp3');
  assert.equal(audio.volume, 0.5);
  audio.resolvePlay();
  await p;
  assert.equal(store.getSnapshot().activeKey, 'a.mp3');

  await store.toggle('a.mp3'); // toggle off
  assert.equal(audio.getAttribute('src'), null);
  assert.deepEqual(audio.log.slice(-3), ['pause', 'remove:src', 'load']);
  for (const h of HANDLERS) assert.equal(audio[h], null, `${h} cleared`);
});

test('backend: a later play after a stop sets src again and resolves, reusing the element', async () => {
  const { store, audio, createdCount } = makeBrowserStore();
  let p = store.toggle('a.mp3');
  await flush();
  audio.resolvePlay();
  await p;
  store.stop();

  p = store.toggle('b.mp3');
  await flush();
  assert.equal(audio.getAttribute('src'), 'b.mp3');
  for (const h of HANDLERS) assert.equal(typeof audio[h], 'function', `${h} bound again`);
  audio.resolvePlay();
  await p;
  assert.equal(store.getSnapshot().activeKey, 'b.mp3');
  assert.equal(createdCount(), 1, 'one shared element');
});

test('backend: stop during loading swallows the AbortError and flags no error', async () => {
  const { store, audio } = makeBrowserStore();
  const p = store.toggle('a.mp3');
  await flush();
  store.stop(); // load() inside release rejects the pending play()
  await p; // must resolve: the rejection belongs to a superseded attempt
  const s = store.getSnapshot();
  assert.equal(s.activeKey, null);
  assert.equal(s.loadingKey, null);
  assert.equal(s.errorKeys.size, 0);
  assert.equal(audio.getAttribute('src'), null);
});

test('backend: the last cover unregistering (a dropped list) releases the media', async () => {
  const { store, audio } = makeBrowserStore();
  const row = {};
  store.register('a.mp3', row);
  const p = store.toggle('a.mp3');
  await flush();
  audio.resolvePlay();
  await p;

  store.unregister('a.mp3', row);
  assert.equal(store.getSnapshot().activeKey, null);
  assert.equal(audio.getAttribute('src'), null);
  for (const h of HANDLERS) assert.equal(audio[h], null);
});

test('backend: onended and onerror release the media, and a fail keeps only its own error', async () => {
  const { store, audio } = makeBrowserStore();
  let p = store.toggle('a.mp3');
  await flush();
  audio.resolvePlay();
  await p;
  audio.onended();
  assert.equal(audio.getAttribute('src'), null);
  assert.equal(store.getSnapshot().errorKeys.size, 0);

  p = store.toggle('b.mp3');
  await flush();
  audio.resolvePlay();
  await p;
  audio.onerror();
  assert.equal(audio.getAttribute('src'), null);
  assert.deepEqual([...store.getSnapshot().errorKeys], ['b.mp3']);
  for (const h of HANDLERS) assert.equal(audio[h], null);
});

test('backend: stop with nothing loaded never touches or creates the element', () => {
  const { store, audio, createdCount } = makeBrowserStore();
  store.stop();
  assert.equal(createdCount(), 0);
  assert.equal(audio.log.length, 0);
});
