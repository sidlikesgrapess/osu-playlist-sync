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
  let token = 0;
  const registrations = new Map(); // previewKey -> Set(instanceId)
  const listeners = new Set();

  const notify = () => listeners.forEach((listener) => listener());

  function stop() {
    const wasPlaying = activeKey !== null || loadingKey !== null;
    activeKey = null;
    loadingKey = null;
    token += 1; // invalidates any in-flight attempt, so its eventual settle is a no-op
    if (wasPlaying) stopPlayback?.();
    notify();
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
    notify();

    const attempt = typeof play === 'function'
      ? Promise.resolve().then(() => play(previewKey))
      : Promise.reject(new Error('useAudioPreview: no play() provided'));

    return attempt.then(
      () => {
        if (myToken !== token) return; // superseded; this attempt's success no longer matters
        loadingKey = null;
        activeKey = previewKey;
        notify();
      },
      (err) => {
        if (myToken !== token) return; // stale rejection, ignored regardless of its name
        loadingKey = null;
        activeKey = null;
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
    return { activeKey, loadingKey };
  }

  function registrationCount(previewKey) {
    return registrations.get(previewKey)?.size ?? 0;
  }

  return { toggle, stop, register, unregister, subscribe, getSnapshot, registrationCount };
}

// --- The one instance the app actually uses. Module-scoped so every consumer (SongTable's
// rows and its alt-picker modal, PlayerSections' rows) shares the same <audio> element and
// the same play state -- the whole point of "one source of truth for play state" (item 2). ---

let audioEl = null;

function ensureAudio() {
  if (typeof window === 'undefined') return null;
  if (!audioEl) {
    audioEl = new window.Audio();
    audioEl.volume = 0.5;
  }
  return audioEl;
}

const store = createPreviewStore({
  play: (previewUrl) => {
    const audio = ensureAudio();
    if (!audio) return Promise.reject(new Error('no window'));
    audio.pause();
    audio.src = previewUrl;
    audio.onended = () => store.stop();
    return audio.play();
  },
  stop: () => {
    if (audioEl) audioEl.pause();
  },
});

const EMPTY_SNAPSHOT = { activeKey: null, loadingKey: null };
function getServerSnapshot() {
  return EMPTY_SNAPSHOT;
}

/**
 * Used by the component that owns a list of rows (SongTable, PlayerSections) -- the
 * "parent" that subscribes to play state, per item 2. Rows receive `isPlaying` /
 * `isPreviewLoading` as plain boolean props computed from this; `BeatmapCover` itself never
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
