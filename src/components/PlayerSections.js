'use client';

import { useState, useEffect, memo } from 'react';
import {
  Trophy, Play, Heart, ChevronDown,
  Loader2, Download, ExternalLink,
} from 'lucide-react';
import OsuCheckbox from './OsuCheckbox';
import BeatmapCover from './BeatmapCover';
import { OverrideMark, OverrideNotice } from './MatchNotice';
import { osuAudio } from '@/lib/soundEffects';
import { getStarColor, formatCompactNumber, getStatusBadgeStyle } from '@/lib/beatmapFormat';
import { useAudioPreview } from '@/lib/useAudioPreview';

const SECTION_META = {
  best: { label: 'Best Performances', icon: Trophy, color: '#ffbb22' },
  most_played: { label: 'Most Played', icon: Play, color: '#3399ff' },
  favourite: { label: 'Favourites', icon: Heart, color: '#ff66aa' },
};

const GRADES = ['XH', 'X', 'SH', 'S', 'A', 'B', 'C', 'D', 'F'];

// ~6 rows before the list starts scrolling instead of growing the page.
const LIST_MAX_HEIGHT = 400;

// F-20: a section shows this many rows before "Show more" reveals the rest. The data is
// already in memory (`allItems`), so revealing more is never a new fetch.
const INITIAL_REVEAL_COUNT = 25;
const REVEAL_STEP = 25;

function GradeIcon({ rank }) {
  if (!rank || !GRADES.includes(rank)) return null;

  return (
    <img
      src={`/grades/${rank}.svg`}
      alt={`${rank} rank`}
      title={`${rank} rank`}
      loading="lazy"
      decoding="async"
      width={36}
      height={18}
      style={{ width: '36px', height: '18px', flexShrink: 0, display: 'block' }}
    />
  );
}

function MetaBadge({ song }) {
  const meta = song.playerMeta || {};

  if (meta.pp !== null && meta.pp !== undefined) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <GradeIcon rank={meta.rank} />
        <span style={{
          background: 'rgba(255, 102, 170, 0.15)',
          border: '1px solid rgba(255, 102, 170, 0.35)',
          color: '#ff66aa',
          fontSize: '0.72rem',
          fontWeight: 800,
          padding: '2px 7px',
          borderRadius: '4px',
          whiteSpace: 'nowrap',
        }}>
          {meta.pp.toLocaleString()}pp
        </span>
      </span>
    );
  }

  if (meta.playCount) {
    return (
      <span
        title={`${Number(meta.playCount).toLocaleString()} plays by this player`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          color: '#3399ff',
          fontSize: '0.72rem',
          fontWeight: 800,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <Play size={10} style={{ fill: '#3399ff' }} />
        <span>{formatCompactNumber(meta.playCount)}</span>
      </span>
    );
  }

  return null;
}

// Memoized per F-19: with `isPlaying`/`isPreviewLoading` collapsed to booleans and
// `onTogglePreview` a stable reference (see `PlayerSections` below), a row whose own props
// are unchanged skips re-rendering when some other row's preview state changes.
const BeatmapRow = memo(function BeatmapRow({
  song, rowKey, isSelected, onToggleSelect, onDownloadSingle, isDownloading,
  isPlaying, isPreviewLoading, onTogglePreview,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const match = song.matchedBeatmap;
  const statusStyle = getStatusBadgeStyle(match.status || '');
  const minStars = match.starRange?.min;
  const maxStars = match.starRange?.max;
  const hasStars = Boolean(maxStars);

  return (
    <div
      onMouseEnter={() => {
        osuAudio.playHover();
        setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 12px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
        background: isSelected ? 'rgba(255, 102, 170, 0.1)' : isHovered ? '#2c2838' : '#252130',
        border: `1px solid ${isSelected ? 'rgba(255, 102, 170, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
        transition: 'background-color 0.12s ease, border-color 0.12s ease',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
        <OsuCheckbox
          id={`checkbox-${rowKey}`}
          checked={isSelected}
          onChange={() => {
            osuAudio.playClick();
            onToggleSelect(song.id);
          }}
          title="Select beatmap for batch download"
        />
        <OverrideMark match={match} song={song} />
      </div>

      {/* Cover + preview */}
      <BeatmapCover
        key={match.covers?.list || match.id}
        coverUrl={match.covers?.list}
        fallbackId={match.id}
        alt={match.title}
        width={62}
        height={40}
        fallbackIconSize={14}
        playIconSize={13}
        playIconFill
        waveBarCount={3}
        waveBarWidth={2.5}
        activeOverlayBg="rgba(16, 14, 22, 0.82)"
        idleOverlayBg="rgba(0, 0, 0, 0.38)"
        hoverScale
        isHovered={isHovered}
        previewUrl={match.previewUrl}
        isPlaying={isPlaying}
        isPreviewLoading={isPreviewLoading}
        onPreviewErrorChange={setPreviewError}
        onTogglePreview={() => {
          osuAudio.playClick();
          return onTogglePreview(match.previewUrl);
        }}
      />

      {/* Details */}
      <div style={{ flex: 1, minWidth: '160px' }}>
        <OverrideNotice match={match} song={song} style={{ marginBottom: '4px' }} />
        {previewError && (
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#ff8888', marginBottom: '4px' }}>
            Preview unavailable
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.84rem',
            fontWeight: 800,
            color: '#ffffff',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}>
            {match.artist} - {match.title}
          </span>
          {match.status && (
            <span style={{
              fontSize: '0.62rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              padding: '1px 5px',
              borderRadius: '3px',
              background: statusStyle.bg,
              color: statusStyle.color,
              flexShrink: 0,
            }}>
              {match.status}
            </span>
          )}
        </div>

        <div style={{
          fontSize: '0.72rem',
          color: '#c6b8ce',
          marginTop: '2px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexWrap: 'wrap',
          fontWeight: 600,
        }}>
          <span>mapped by <strong style={{ color: '#ffffff' }}>{match.creator}</strong></span>
          {hasStars && (
            <>
              <span>•</span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 700,
                fontSize: '0.68rem',
                padding: '1px 5px',
                borderRadius: '3px',
                background: 'rgba(0, 0, 0, 0.4)',
                color: getStarColor(maxStars),
              }}>
                {Math.abs(minStars - maxStars) < 0.05
                  ? `★ ${maxStars.toFixed(2)}`
                  : `★ ${minStars.toFixed(1)} - ${maxStars.toFixed(1)}`}
              </span>
            </>
          )}
        </div>
      </div>

      <MetaBadge song={song} />

      {/* Actions */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <a
          href={`https://osu.ppy.sh/beatmapsets/${match.id}`}
          target="_blank"
          rel="noreferrer"
          className="osu-btn-interactive"
          style={{
            background: '#343040',
            color: '#c6b8ce',
            padding: '6px',
            borderRadius: '5px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            textDecoration: 'none',
          }}
          title="View on osu! website"
        >
          <ExternalLink size={13} />
        </a>
        <button
          className="osu-btn-interactive osu-btn-pink"
          onClick={() => {
            osuAudio.playClick();
            onDownloadSingle(song);
          }}
          disabled={isDownloading}
          style={{
            border: 'none',
            padding: '6px 12px',
            borderRadius: '5px',
            fontSize: '0.74rem',
            fontWeight: 800,
            cursor: isDownloading ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: 'inherit',
          }}
          title="Download .osz file"
        >
          {isDownloading ? <Loader2 size={12} className="spin-slow" /> : <Download size={12} />}
          <span>.OSZ</span>
        </button>
      </div>
    </div>
  );
});

export default function PlayerSections({
  sections,
  selectedIds,
  onToggleSelect,
  onSelectMany,
  onToggleSection,
  onDownloadSingle,
  downloadingIds,
  mode,
  status,
}) {
  // Single source of truth for preview play state (item 2): rows below get plain
  // `isPlaying`/`isPreviewLoading` booleans and the stable `toggle` reference, they never
  // subscribe themselves.
  const { isPlaying, isLoading: isPreviewLoading, toggle } = useAudioPreview();

  // F-20's local reveal, one counter per section. Reset when the active mode/status filters
  // change, since `allItems` becomes a different list underneath the same section type.
  const [revealCounts, setRevealCounts] = useState({});
  useEffect(() => {
    setRevealCounts({});
  }, [mode, status]);

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto 40px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Object.entries(SECTION_META).map(([type, meta]) => {
        const section = sections[type];
        const Icon = meta.icon;
        const allItems = section.allItems || [];
        const revealCount = revealCounts[type] ?? INITIAL_REVEAL_COUNT;
        const visibleRows = allItems.slice(0, revealCount);
        const hasMore = allItems.length > visibleRows.length;
        // The profile's own count is the real total. When the loaded window, filtered and
        // deduped, shows fewer, say so ("88 of 469") instead of passing one off as the other.
        const total = section.total || 0;
        const countLabel = section.loaded && allItems.length < total
          ? `${allItems.length.toLocaleString()} of ${total.toLocaleString()}`
          : total.toLocaleString();

        return (
          <div
            key={type}
            className="osu-glass"
            style={{
              borderRadius: '10px',
              overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: '#1c1a25',
            }}
          >
            {/* Section header */}
            <button
              className="osu-btn-interactive"
              onClick={() => {
                osuAudio.playClick();
                onToggleSection(type);
              }}
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 16px',
                background: section.isOpen ? '#232030' : 'transparent',
                border: 'none',
                borderBottom: section.isOpen ? '1px solid rgba(255, 255, 255, 0.07)' : 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <Icon size={16} color={meta.color} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#ffffff' }}>
                {meta.label}
              </span>
              <span style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                color: '#887c93',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                padding: '2px 7px',
                borderRadius: '4px',
              }}>
                {countLabel}
              </span>

              <span style={{ flex: 1 }} />

              {section.isLoading && <Loader2 size={14} className="spin-slow" color="#ffbb22" />}
              <ChevronDown
                size={16}
                color="#887c93"
                style={{
                  transform: section.isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                  flexShrink: 0,
                }}
              />
            </button>

            {/* Section body */}
            {section.isOpen && (
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {section.error && (
                  <div style={{
                    background: 'rgba(255, 68, 68, 0.12)',
                    border: '1px solid rgba(255, 68, 68, 0.3)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    color: '#ff8888',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}>
                    {section.error}
                  </div>
                )}

                {section.isLoading && allItems.length === 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#ffbb22',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    padding: '10px 2px',
                  }}>
                    <Loader2 size={14} className="spin-slow" />
                    <span>Loading beatmaps...</span>
                  </div>
                )}

                {!section.isLoading && !section.error && allItems.length === 0 && (
                  <div style={{ color: '#887c93', fontSize: '0.8rem', fontWeight: 600, padding: '8px 2px' }}>
                    Nothing here for this player with the current mode/status filters.
                  </div>
                )}

                {allItems.length > 0 && (() => {
                  const allSelected = allItems.every(s => selectedIds.has(s.id));
                  return (
                    <button
                      className="osu-btn-interactive"
                      onClick={() => {
                        osuAudio.playClick();
                        onSelectMany(allItems.map(s => s.id), !allSelected);
                      }}
                      style={{
                        alignSelf: 'flex-start',
                        background: '#262232',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#c0b4c8',
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {allSelected ? 'Deselect All' : `Select All (${allItems.length})`}
                    </button>
                  );
                })()}

                {/* The revealed window scrolls in place -- roughly six rows tall, so an open
                    section never pushes the ones below it off the screen. */}
                {visibleRows.length > 0 && (
                  <div style={{
                    maxHeight: `${LIST_MAX_HEIGHT}px`,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '7px',
                    // Cancel the body's right padding so the scrollbar sits against
                    // the card edge, then hold the rows clear of it — otherwise it
                    // overlaps the .OSZ button on hover.
                    marginRight: '-12px',
                    paddingRight: '9px',
                  }}>
                    {visibleRows.map((song, idx) => {
                      // Position is part of the row key: a duplicate id would
                      // otherwise collide and make React duplicate or drop rows.
                      const rowKey = `${type}-${idx}-${song.id}`;
                      const previewUrl = song.matchedBeatmap?.previewUrl;

                      return (
                        <BeatmapRow
                          key={rowKey}
                          rowKey={rowKey}
                          song={song}
                          isSelected={selectedIds.has(song.id)}
                          onToggleSelect={onToggleSelect}
                          onDownloadSingle={onDownloadSingle}
                          isDownloading={downloadingIds.has(song.id)}
                          isPlaying={isPlaying(previewUrl)}
                          isPreviewLoading={isPreviewLoading(previewUrl)}
                          onTogglePreview={toggle}
                        />
                      );
                    })}
                  </div>
                )}

                {hasMore && (
                  <button
                    className="osu-btn-interactive"
                    onClick={() => {
                      osuAudio.playClick();
                      setRevealCounts(prev => ({ ...prev, [type]: revealCount + REVEAL_STEP }));
                    }}
                    style={{
                      alignSelf: 'flex-start',
                      background: '#262232',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#c0b4c8',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Show more ({allItems.length - visibleRows.length} left)
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
