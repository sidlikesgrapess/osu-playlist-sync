'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * The mount-registry + play-state machine, with no DOM/Audio dependency of its own so it can
 * be exercised in `test/useAudioPreview.test.mjs` without a browser. The one browser-facing
 * instance below wires it to a lazily created `<audio>` element (`soundEffects.js:15`
 * pattern) and is what every consumer in the app actually imports.
 *
 * The stop rule is a mount registry, not a trigger list (REBUILD_PLAN.md 2.4 item 1): state
 * is keyed by what is playing (`previewKey`, the beatmap's preview URL), not by which
 * component asked for it. Each `BeatmapCover` registers `(previewKey, instanceId)` on mount
 * and unregisters on unmount or key change; when the last registration for the *currently
 * playing or loading* key goes away, playback stops. That one rule is what makes page
 * change, a filter, a section collapse, the local re-filter, closing the alt-picker, an alt
 * swap and clearing the list all behave correctly without enumerating any of them here.
 */
export function createPreviewStore({ play, stop: stopPlayback } = {}) {
  let activeKey = null;
  let loadingKey = null;
  // Set while the element is fetching or has run dry mid play (`waiting`/`stalled`), so the
  // cover can draw a spinner rather than wave bars over silence. Only ever equal to
  // `activeKey` or `loadingKey`, or null.
  let bufferingKey = null;
  // Keys whose last attempt failed, before or after playback began. A set rather than one
  // key, so an earlier failed row keeps saying so while another row plays. Replaced (never
  // mutated) on change so the snapshot reference moves with it.
  let errorKeys = new Set();
  let token = 0;
  const registrations = new Map(); // previewKey -> Set(instanceId)
  const listeners = new Set();

  // `useSyncExternalStore` calls `getSnapshot()` on every render (not just after a `notify`)
  // to check whether the store changed, comparing by reference. A fresh `{ activeKey,
  // loadingKey }` literal on every call would never compare equal to itself, so React would
  // conclude the store changes on every render and re-render forever ("Maximum update depth
  // exceeded"). The snapshot is cached here and only replaced when `activeKey`/`loadingKey`
  // actually change (below, alongside the `notify()` calls that mean they did).
  let snapshot = { activeKey, loadingKey, bufferingKey, errorKeys };
  const refreshSnapshot = () => { snapshot = { activeKey, loadingKey, bufferingKey, errorKeys }; };

  const isCurrent = (previewKey) => !!previewKey && (previewKey === activeKey || previewKey === loadingKey);

  function setError(previewKey, errored) {
    if (errorKeys.has(previewKey) === errored) return false;
    errorKeys = new Set(errorKeys);
    if (errored) errorKeys.add(previewKey);
    else errorKeys.delete(previewKey);
    return true;
  }

  const notify = () => listeners.forEach((listener) => listener());

  function stop() {
    const wasPlaying = activeKey !== null || loadingKey !== null;
    activeKey = null;
    loadingKey = null;
    bufferingKey = null;
    token += 1; // invalidates any in-flight attempt, so its eventual settle is a no-op
    refreshSnapshot();
    if (wasPlaying) stopPlayback?.();
    notify();
  }

  /**
   * Media element events land here. Both are no-ops unless `previewKey` is the key being
   * loaded or played right now, the same stale rule the token gives `toggle`: an event from
   * a src that has since been replaced or stopped never touches state.
   */
  function setBuffering(previewKey, isBuffering) {
    if (!isCurrent(previewKey)) return;
    const next = isBuffering ? previewKey : null;
    if (bufferingKey === next) return;
    bufferingKey = next;
    refreshSnapshot();
    notify();
  }

  // A failure at any point, including after `play()` resolved (a dropped connection or a
  // file that will not decode). Stops playback and remembers the key as errored.
  function fail(previewKey) {
    if (!isCurrent(previewKey)) return;
    setError(previewKey, true);
    stop(); // refreshes the snapshot and notifies, covering the error change too
  }

  /**
   * Starts (or stops, if `previewKey` is already the active/loading one) playback for a
   * key. Returns a promise that resolves when this specific attempt succeeds, and rejects
   * only when this specific attempt fails -- a rejection from an attempt a newer `toggle`
   * call has since superseded (the stale-token rule) is swallowed here rather than
   * propagated, so `AbortError`/`NotAllowedError` (or anything else) from an old attempt
   * never surfaces as a caller-visible error.
   */
  function toggle(previewKey) {
    if (!previewKey) return Promise.resolve();

    if (activeKey === previewKey || loadingKey === previewKey) {
      stop();
      return Promise.resolve();
    }

    token += 1;
    const myToken = token;
    loadingKey = previewKey;
    activeKey = null;
    bufferingKey = null;
    setError(previewKey, false); // a fresh attempt is the retry
    refreshSnapshot();
    notify();

    const attempt = typeof play === 'function'
      ? Promise.resolve().then(() => play(previewKey))
      : Promise.reject(new Error('useAudioPreview: no play() provided'));

    return attempt.then(
      () => {
        if (myToken !== token) return; // superseded; this attempt's success no longer matters
        loadingKey = null;
        activeKey = previewKey;
        refreshSnapshot();
        notify();
      },
      (err) => {
        if (myToken !== token) return; // stale rejection, ignored regardless of its name
        loadingKey = null;
        activeKey = null;
        bufferingKey = null;
        setError(previewKey, true);
        refreshSnapshot();
        notify();
        throw err;
      }
    );
  }

  function register(previewKey, instanceId) {
    if (!previewKey) return;
    if (!registrations.has(previewKey)) registrations.set(previewKey, new Set());
    registrations.get(previewKey).add(instanceId);
  }

  function unregister(previewKey, instanceId) {
    const set = registrations.get(previewKey);
    if (!set) return;
    set.delete(instanceId);
    if (set.size === 0) {
      registrations.delete(previewKey);
      if (activeKey === previewKey || loadingKey === previewKey) {
        stop();
      }
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function getSnapshot() {
    return snapshot;
  }

  function registrationCount(previewKey) {
    return registrations.get(previewKey)?.size ?? 0;
  }

  return { toggle, stop, setBuffering, fail, register, unregister, subscribe, getSnapshot, registrationCount };
}

// --- The one instance the app actually uses. Module-scoped so every consumer (SongTable's
// rows and its alt-picker modal, PlayerSections' rows) shares the same <audio> element and
// the same play state -- the whole point of "one source of truth for play state" (item 2). ---

/**
 * The `play`/`stop` pair `createPreviewStore` drives, wired to one lazily created media
 * element from `createAudio()` (returns null when there is no window). `getStore` is a thunk
 * because the handlers call back into the store this backend is passed to. Split out and
 * exported so `test/useAudioPreview.test.mjs` can hand it a fake element.
 *
 * Stopping releases the media, not just pauses it: the element drops its src, so the old
 * preview's buffered/decoded audio is freed as soon as playback stops for any reason (toggle
 * off, ended, failure, or the last cover unmounting when a new search drops the list).
 */
export function createAudioBackend(createAudio, getStore) {
  let audioEl = null;

  function ensureAudio() {
    if (!audioEl) {
      audioEl = createAudio();
      if (audioEl) audioEl.volume = 0.5;
    }
    return audioEl;
  }

  // Detach first: clearing src fires `emptied`/`abort` (and can fire `error` in some
  // browsers), and none of that may reach the store as a failure of the key just stopped.
  function release(audio) {
    audio.pause();
    audio.onended = null;
    audio.onwaiting = null;
    audio.onstalled = null;
    audio.onplaying = null;
    audio.onerror = null;
    if (audio.hasAttribute('src')) {
      audio.removeAttribute('src');
      audio.load(); // without load() the element keeps the old resource despite no src
    }
  }

  return {
    play: (previewUrl) => {
      const audio = ensureAudio();
      if (!audio) return Promise.reject(new Error('no window'));
      audio.pause();
      const store = getStore();
      // Handlers are properties, not addEventListener, so each attempt replaces the last
      // one's and every handler is bound to the key it was set up for. The store ignores a
      // key that is no longer current, so a late event from an old src cannot mark the new one.
      audio.onended = () => store.stop();
      audio.onwaiting = () => store.setBuffering(previewUrl, true);
      // `stalled` only means the network went quiet; buffered audio may still be playing, and
      // then no `playing` event would follow to clear the spinner. Count it only when the
      // element really has nothing ahead to play (below HAVE_FUTURE_DATA).
      audio.onstalled = () => {
        if (audio.readyState < 3) store.setBuffering(previewUrl, true);
      };
      audio.onplaying = () => store.setBuffering(previewUrl, false);
      audio.onerror = () => store.fail(previewUrl);
      audio.src = previewUrl;
      return audio.play();
    },
    stop: () => {
      if (audioEl) release(audioEl);
    },
  };
}

const store = createPreviewStore(createAudioBackend(
  () => (typeof window === 'undefined' ? null : new window.Audio()),
  () => store,
));

const EMPTY_SNAPSHOT = { activeKey: null, loadingKey: null, bufferingKey: null, errorKeys: new Set() };
function getServerSnapshot() {
  return EMPTY_SNAPSHOT;
}

/**
 * Used by the component that owns a list of rows (SongTable, PlayerSections) -- the
 * "parent" that subscribes to play state, per item 2. Rows receive `isPlaying` /
 * `isPreviewLoading` (from `isBuffering`) / `hasPreviewError` as plain boolean props computed
 * from this; `BeatmapCover` itself never
 * calls this hook (see `useAudioPreviewMount` below).
 */
export function useAudioPreview() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);
  const toggle = useCallback((previewUrl) => store.toggle(previewUrl), []);

  return {
    activeKey: snapshot.activeKey,
    loadingKey: snapshot.loadingKey,
    isPlaying: (previewUrl) => !!previewUrl && snapshot.activeKey === previewUrl,
    isLoading: (previewUrl) => !!previewUrl && snapshot.loadingKey === previewUrl,
    // Busy but not audibly playing: the first fetch, or a mid play `waiting`/`stalled`.
    isBuffering: (previewUrl) => !!previewUrl
      && (snapshot.loadingKey === previewUrl || snapshot.bufferingKey === previewUrl),
    hasError: (previewUrl) => !!previewUrl && snapshot.errorKeys.has(previewUrl),
    toggle,
  };
}

/**
 * Used only by `BeatmapCover`: registers this instance's presence for `previewUrl` on
 * mount, unregisters on unmount or when `previewUrl` changes. Deliberately does not
 * subscribe to play state (no re-render here when some other cover starts or stops), which
 * is what "covers do not subscribe" (item 2) means in practice.
 */
export function useAudioPreviewMount(previewUrl) {
  useEffect(() => {
    if (!previewUrl) return undefined;
    const instanceId = {};
    store.register(previewUrl, instanceId);
    return () => store.unregister(previewUrl, instanceId);
  }, [previewUrl]);
}

// Exposed for tests only (`test/useAudioPreview.test.mjs`); not meant for component code.
export const __internal = { store };
