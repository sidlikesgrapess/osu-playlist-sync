'use client';

import { useState, useEffect, useRef, memo } from 'react';
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
import { DOCK_TOP_VAR, parseDockTop, isHeaderDocked, collapseScrollTarget } from '@/lib/stickySections';

const SECTION_META = {
  best: { label: 'Best Performances', icon: Trophy, color: '#ffbb22' },
  most_played: { label: 'Most Played', icon: Play, color: '#3399ff' },
  favourite: { label: 'Favourites', icon: Heart, color: '#ff66aa' },
};

const GRADES = ['XH', 'X', 'SH', 'S', 'A', 'B', 'C', 'D', 'F'];

// Todo item 12: an open section shows its revealed rows at full length in the page, and its
// header docks under the search bar while you scroll through it. The motion uses the search
// bar's own dock easing (PlaylistInput.js), so the two move as one.
const DOCK_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const BODY_MS = 300;
// If a transitionend never arrives (the grid transition is unsupported, the tab is hidden),
// the closed body still unmounts, a little after the transition would have ended.
const UNMOUNT_FALLBACK_MS = BODY_MS + 150;

// Rounded corners come from the header and the card's own background, never from
// `overflow: hidden` on the card: that would make the card a scroll container and the header
// would stick to it instead of the viewport.
const CARD_RADIUS = 10;
const INNER_RADIUS = CARD_RADIUS - 1;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function readDockTop() {
  return parseDockTop(window.getComputedStyle(document.documentElement).getPropertyValue(DOCK_TOP_VAR));
}

/**
 * Animates a section body between 0 and its full height with the grid-template-rows 0fr to
 * 1fr trick, which needs no measuring. The body stays mounted while it closes and unmounts
 * once the transition ends, so hundreds of hidden rows do not stay in the DOM.
 */
function SectionBody({ id, isOpen, reducedMotion, children }) {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isExpanded, setIsExpanded] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      if (reducedMotion) {
        setIsExpanded(true);
        return undefined;
      }
      // Let the collapsed frame paint first, or the browser has nothing to transition from.
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setIsExpanded(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    setIsExpanded(false);
    if (reducedMotion) {
      setIsRendered(false);
      return undefined;
    }
    const timer = setTimeout(() => setIsRendered(false), UNMOUNT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [isOpen, reducedMotion]);

  if (!isRendered) return null;

  return (
    <div
      id={id}
      className="ps-anim"
      data-expanded={isExpanded ? 'true' : 'false'}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && !isOpen) setIsRendered(false);
      }}
      style={{
        display: 'grid',
        gridTemplateRows: isExpanded ? '1fr' : '0fr',
        transition: reducedMotion ? 'none' : `grid-template-rows ${BODY_MS}ms ${DOCK_EASE}`,
      }}
    >
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

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
  isPlaying, isPreviewLoading, hasPreviewError, onTogglePreview,
}) {
  const [isHovered, setIsHovered] = useState(false);
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
        hasPreviewError={hasPreviewError}
        onTogglePreview={() => {
          osuAudio.playClick();
          return onTogglePreview(match.previewUrl);
        }}
      />

      {/* Details */}
      <div style={{ flex: 1, minWidth: '160px' }}>
        <OverrideNotice match={match} song={song} style={{ marginBottom: '4px' }} />
        {hasPreviewError && (
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
  const { isPlaying, isBuffering, hasError, toggle } = useAudioPreview();

  // F-20's local reveal, one counter per section. Reset when the active mode/status filters
  // change, since `allItems` becomes a different list underneath the same section type.
  const [revealCounts, setRevealCounts] = useState({});
  useEffect(() => {
    setRevealCounts({});
  }, [mode, status]);

  const reducedMotion = usePrefersReducedMotion();
  const cardRefs = useRef({});

  // Which open headers are docked right now, only for their docked look (shadow, square top
  // corners). Docking itself is plain `position: sticky` and needs no script at all.
  const [dockedKey, setDockedKey] = useState('');
  const openKey = Object.keys(SECTION_META).filter(type => sections[type]?.isOpen).join(',');
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const dockTop = readDockTop();
      const docked = openKey.split(',').filter(type => {
        const card = cardRefs.current[type];
        return card && isHeaderDocked({ cardTop: card.getBoundingClientRect().top, dockTop });
      });
      const next = docked.join(',');
      setDockedKey(prev => (prev === next ? prev : next));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [openKey]);
  const dockedTypes = new Set(dockedKey ? dockedKey.split(',') : []);

  const handleToggle = (type, isOpen) => {
    osuAudio.playClick();
    // Collapsing a docked section: jump so the collapsed header lands where the docked one
    // is, instead of leaving the user far below it (see collapseScrollTarget).
    const card = cardRefs.current[type];
    if (isOpen && card) {
      const target = collapseScrollTarget({
        cardTop: card.getBoundingClientRect().top,
        scrollY: window.scrollY,
        dockTop: readDockTop(),
      });
      if (target !== null) window.scrollTo({ top: target, behavior: 'auto' });
    }
    onToggleSection(type);
  };

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

        const isOpen = Boolean(section.isOpen);
        const isDocked = isOpen && dockedTypes.has(type);
        const bodyId = `player-section-body-${type}`;
        const toggleLabel = `${isOpen ? 'Collapse' : 'Expand'} ${meta.label}`;

        return (
          <div
            key={type}
            ref={el => { cardRefs.current[type] = el; }}
            className="osu-glass"
            data-section={type}
            style={{
              borderRadius: `${CARD_RADIUS}px`,
              // No overflow here (see CARD_RADIUS): the header sticks inside this card, so
              // the card's bottom edge is what pushes it out when the next section arrives.
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: '#1c1a25',
            }}
          >
            {/* Section header. Sticky within its own card at the line PlaylistInput
                publishes, so it sits under the navbar (z 60) and the search bar (z 45). */}
            <div
              className="ps-anim ps-header"
              data-docked={isDocked ? 'true' : 'false'}
              style={{
                // The dock offset belongs to sticky only. On any other positioned element
                // `top` shifts it, which would float a closed header far below its card.
                position: isOpen ? 'sticky' : 'static',
                top: isOpen ? `var(${DOCK_TOP_VAR}, 56px)` : 'auto',
                zIndex: 30,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0 8px 0 0',
                background: isOpen ? '#232030' : 'transparent',
                borderBottom: `1px solid ${isOpen ? 'rgba(255, 255, 255, 0.07)' : 'transparent'}`,
                borderRadius: isOpen
                  ? (isDocked ? '0px' : `${INNER_RADIUS}px ${INNER_RADIUS}px 0 0`)
                  : `${INNER_RADIUS}px`,
                boxShadow: isDocked ? '0 10px 22px rgba(0, 0, 0, 0.5)' : '0 0 0 rgba(0, 0, 0, 0)',
                transition: reducedMotion
                  ? 'none'
                  : `box-shadow 0.28s ${DOCK_EASE}, border-radius 0.28s ${DOCK_EASE}, background-color 0.28s ${DOCK_EASE}, border-color 0.28s ${DOCK_EASE}`,
              }}
            >
              <button
                type="button"
                className="osu-btn-interactive"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => handleToggle(type, isOpen)}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 8px 12px 16px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={16} color={meta.color} style={{ flexShrink: 0 }} />
                <span style={{
                  fontSize: '0.92rem',
                  fontWeight: 900,
                  color: '#ffffff',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
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
                  flexShrink: 0,
                }}>
                  {countLabel}
                </span>

                <span style={{ flex: 1 }} />

                {section.isLoading && <Loader2 size={14} className="spin-slow" color="#ffbb22" style={{ flexShrink: 0 }} />}
              </button>

              {/* The explicit collapse control. The whole header toggles too; this is the
                  visible, labelled affordance, and it works the same while docked. */}
              <button
                type="button"
                className="osu-btn-interactive ps-collapse-btn"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                aria-label={toggleLabel}
                title={toggleLabel}
                onClick={() => handleToggle(type, isOpen)}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '30px',
                  height: '30px',
                  borderRadius: '6px',
                  background: isOpen ? '#2c2838' : 'transparent',
                  border: `1px solid ${isOpen ? 'rgba(255, 255, 255, 0.1)' : 'transparent'}`,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <ChevronDown
                  size={16}
                  color={isOpen ? '#c6b8ce' : '#887c93'}
                  className="ps-anim"
                  style={{
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: reducedMotion ? 'none' : `transform ${BODY_MS}ms ${DOCK_EASE}`,
                  }}
                />
              </button>
            </div>

            {/* Section body, animated open and shut */}
            <SectionBody id={bodyId} isOpen={isOpen} reducedMotion={reducedMotion}>
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

                {/* Every revealed row sits in the page at full length (todo item 12); the
                    header above stays docked while you scroll through them. */}
                {visibleRows.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
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
                          isPreviewLoading={isBuffering(previewUrl)}
                          hasPreviewError={hasError(previewUrl)}
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
            </SectionBody>
          </div>
        );
      })}
    </div>
  );
}
