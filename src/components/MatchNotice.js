'use client';

import { overrideNoticeFor } from '@/lib/beatmapFormat';

// No dash anywhere in this copy -- see the project's no-dash convention.
const NOTICE_COPY = {
  artist: (artist) => `Could not find one by ${artist}. Closest match:`,
  closest: () => 'Closest match:',
  title: () => 'Closest title match:',
};

function noticeTextFor(match, song) {
  const notice = overrideNoticeFor(match, song);
  if (!notice) return null;
  const build = NOTICE_COPY[notice.kind];
  return build ? build(notice.artist) : null;
}

/**
 * The small red "!" beside a row's checkbox. Renders only when `OverrideNotice` would also
 * render something for the same `match`/`song` -- both call `overrideNoticeFor` themselves,
 * so the mark and the sentence can never appear one without the other (REBUILD_PLAN.md 2.4
 * item 5 / F-49, X-10).
 */
export function OverrideMark({ match, song }) {
  if (!noticeTextFor(match, song)) return null;
  return (
    <span
      title="This match may not be right. Check before downloading"
      style={{ color: '#ff5555', fontSize: '0.82rem', fontWeight: 900, lineHeight: 1, flexShrink: 0 }}
    >
      !
    </span>
  );
}

/** The sentence introducing a flagged match, styled like the row's original inline notice. */
export function OverrideNotice({ match, song, style }) {
  const text = noticeTextFor(match, song);
  if (!text) return null;
  return (
    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#ff3d5e', marginBottom: '5px', ...style }}>
      {text}
    </div>
  );
}
