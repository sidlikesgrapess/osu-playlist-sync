'use client';

import { useEffect, useState } from 'react';
import { Music, Play } from 'lucide-react';
import { useAudioPreviewMount } from '@/lib/useAudioPreview';

/**
 * The beatmap cover + play-preview overlay shared by SongRow, SongCardMobile and
 * PlayerSections' BeatmapRow (REBUILD_PLAN.md 2.4 item 6). Each call site passes the sizing
 * and icon numbers it already used, so the three rows keep looking exactly as they did before
 * this was pulled out -- this component reuses each one's existing styles, it does not pick a
 * single new look for all three.
 *
 * `key={coverUrl}` at the call site (not here) is what resets `imgError` when an alternative
 * match swaps the cover out from under the same row.
 *
 * Play state (`isPlaying`/`isPreviewLoading`) is a prop, never a subscription -- the parent
 * list owns `useAudioPreview()` (item 2). This component only registers its mount for the
 * stop-rule registry via `useAudioPreviewMount`.
 */
export default function BeatmapCover({
  coverUrl,
  fallbackId,
  alt,
  width,
  height,
  hoverScale = false,
  isHovered = false,
  previewUrl,
  isPlaying = false,
  isPreviewLoading = false,
  onTogglePreview,
  onPreviewErrorChange,
  fallbackIconSize = 16,
  playIconSize = 15,
  playIconFill = false,
  waveBarCount = 5,
  waveBarWidth,
  playButtonClassName,
  activeOverlayBg = 'rgba(16, 14, 22, 0.85)',
  idleOverlayBg = 'rgba(0, 0, 0, 0.4)',
}) {
  const [imgError, setImgError] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  useAudioPreviewMount(previewUrl);

  // A successful play (or a fresh attempt) clears any earlier error.
  useEffect(() => {
    if (isPlaying || isPreviewLoading) setPreviewError(false);
  }, [isPlaying, isPreviewLoading]);

  useEffect(() => {
    onPreviewErrorChange?.(previewError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewError]);

  const src = coverUrl || (fallbackId ? `https://assets.ppy.sh/beatmaps/${fallbackId}/covers/list.jpg` : null);
  // Wave bars show as soon as a toggle is asked for, not only once playback is confirmed --
  // the same instant feedback the old, un-shared version gave on click.
  const showActive = isPlaying || isPreviewLoading;

  const handleToggle = (event) => {
    // Stops the click from reaching a clickable ancestor (SongTable's alt-picker rows select
    // the alternative on click) -- SongRow/Mobile/BeatmapRow have no such ancestor, so this
    // is a no-op there.
    event.stopPropagation();
    if (!onTogglePreview) return;
    const result = onTogglePreview();
    if (result?.catch) {
      result.catch(() => setPreviewError(true));
    }
  };

  return (
    <div
      className="osu-thumb-container"
      style={{
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: '5px',
        flexShrink: 0,
        background: '#343040',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={width}
          height={height}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            ...(hoverScale ? {
              transform: isHovered ? 'scale(1.06)' : 'scale(1)',
              transition: 'transform 0.2s ease',
            } : {}),
          }}
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #343040 0%, #282532 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Music size={fallbackIconSize} color="#ff66aa" />
        </div>
      )}

      {previewUrl && (
        <button
          type="button"
          className={playButtonClassName}
          onClick={handleToggle}
          title={
            previewError
              ? 'Preview unavailable'
              : showActive ? 'Pause audio preview' : 'Play audio preview'
          }
          aria-label={previewError ? 'Preview unavailable' : showActive ? 'Pause audio preview' : 'Play audio preview'}
          style={{
            position: 'absolute',
            inset: 0,
            background: showActive ? activeOverlayBg : idleOverlayBg,
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
        >
          {showActive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: waveBarWidth ? '2px' : '3px' }}>
              {Array.from({ length: waveBarCount }, (_, i) => (
                <div key={i} className="osu-wave-bar" style={waveBarWidth ? { width: `${waveBarWidth}px` } : undefined} />
              ))}
            </div>
          ) : (
            <Play size={playIconSize} color="#ffffff" style={playIconFill ? { fill: '#ffffff' } : undefined} />
          )}
        </button>
      )}
    </div>
  );
}
