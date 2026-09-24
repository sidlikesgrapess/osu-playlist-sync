'use client';

import { useCallback, useInsertionEffect, useRef } from 'react';

/**
 * Returns a function whose identity never changes across renders, but which always calls
 * the latest `fn` passed in. Lets a JSX call site hand a memoized child (SongRow,
 * SongCardMobile, BeatmapRow) a callback prop without the child's own identity churning
 * every render just because the parent re-created the closure -- the parent still writes an
 * ordinary inline arrow function, it is only wrapped once, here, at the prop site.
 *
 * `useInsertionEffect` runs before layout/paint effects, so `ref.current` is always the
 * render's own `fn` by the time any event handler could fire from that render (React
 * 18.3.1, confirmed by REBUILD_PLAN.md 2.4 item 3).
 */
export function useStableCallback(fn) {
  const ref = useRef(fn);

  useInsertionEffect(() => {
    ref.current = fn;
  });

  return useCallback((...args) => ref.current?.(...args), []);
}
