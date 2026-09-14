'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Trophy, Play, Heart, ChevronDown, ChevronLeft, ChevronRight,
  Loader2, Download, ExternalLink, Music,
} from 'lucide-react';
import OsuCheckbox from './OsuCheckbox';
import { osuAudio } from '@/lib/soundEffects';
import { getStarColor, formatCompactNumber, getStatusBadgeStyle } from '@/lib/beatmapFormat';

const SECTION_META = {
  best: { label: 'Best Performances', icon: Trophy, color: '#ffbb22' },
  most_played: { label: 'Most Played', icon: Play, color: '#3399ff' },
  favourite: { label: 'Favourites', icon: Heart, color: '#ff66aa' },
};

const GRADES = ['XH', 'X', 'SH', 'S', 'A', 'B', 'C', 'D', 'F'];

function GradeIcon({ rank }) {
  if (!rank || !GRADES.includes(rank)) return null;

  return (
    <img
      src={`/grades/${rank}.svg`}
      alt={`${rank} rank`}
      title={`${rank} rank`}
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

function BeatmapRow({ song, isSelected, onToggleSelect, onDownloadSingle, isDownloading, activeAudio, onToggleAudio }) {
  const [imgError, setImgError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const match = song.matchedBeatmap;
  const isPlaying = activeAudio === song.id;
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
      <OsuCheckbox
        id={`checkbox-${song.id}`}
        checked={isSelected}
        onChange={() => {
          osuAudio.playClick();
          onToggleSelect(song.id);
        }}
        title="Select beatmap for batch download"
      />

      {/* Cover + preview */}
      <div className="osu-thumb-container" style={{
        width: '62px',
        height: '40px',
        borderRadius: '5px',
        flexShrink: 0,
        background: '#343040',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {!imgError ? (
          <img
            src={match.covers?.list || `https://assets.ppy.sh/beatmaps/${match.id}/covers/list.jpg`}
            alt={match.title}
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: isHovered ? 'scale(1.06)' : 'scale(1)',
              transition: 'transform 0.2s ease',
            }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Music size={14} color="#ff66aa" />
          </div>
        )}
        <button
          onClick={() => {
            osuAudio.playClick();
            onToggleAudio(song.id, match.previewUrl);
          }}
          title={isPlaying ? 'Pause preview' : 'Play preview'}
          style={{
            position: 'absolute',
            inset: 0,
            background: isPlaying ? 'rgba(16, 14, 22, 0.82)' : 'rgba(0, 0, 0, 0.38)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {isPlaying ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
              <div className="osu-wave-bar" style={{ width: '2.5px' }} />
              <div className="osu-wave-bar" style={{ width: '2.5px' }} />
              <div className="osu-wave-bar" style={{ width: '2.5px' }} />
            </div>
          ) : (
            <Play size={13} color="#ffffff" style={{ fill: '#ffffff' }} />
          )}
        </button>
      </div>

      {/* Details */}
      <div style={{ flex: 1, minWidth: '160px' }}>
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
}

function SectionPagination({ page, totalPages, onPageChange, disabled }) {
  if (totalPages <= 1) return null;

  const pages = (() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 3) return [1, 2, 3, 4, '...', totalPages];
    if (page >= totalPages - 2) return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, '...', page - 1, page, page + 1, '...', totalPages];
  })();

  const navStyle = (isDisabled) => ({
    background: '#262232',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    color: isDisabled ? '#554d60' : '#c0b4c8',
    borderRadius: '5px',
    padding: '4px 8px',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'inherit',
  });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      flexWrap: 'wrap',
      paddingTop: '4px',
    }}>
      <button
        className="osu-btn-interactive"
        onClick={() => page > 1 && onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        style={navStyle(disabled || page <= 1)}
      >
        <ChevronLeft size={14} />
      </button>

      {pages.map((p, idx) => (
        typeof p === 'number' ? (
          <button
            key={p}
            className="osu-btn-interactive"
            onClick={() => onPageChange(p)}
            disabled={disabled}
            style={{
              background: page === p ? '#ff66aa' : '#262232',
              border: `1px solid ${page === p ? '#ff66aa' : 'rgba(255, 255, 255, 0.08)'}`,
              color: page === p ? '#ffffff' : '#c0b4c8',
              borderRadius: '5px',
              minWidth: '28px',
              height: '28px',
              padding: '0 6px',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: disabled ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {p}
          </button>
        ) : (
          <span key={`dots_${idx}`} style={{ color: '#887c93', padding: '0 4px', fontSize: '0.74rem' }}>...</span>
        )
      ))}

      <button
        className="osu-btn-interactive"
        onClick={() => page < totalPages && onPageChange(page + 1)}
        disabled={disabled || page >= totalPages}
        style={navStyle(disabled || page >= totalPages)}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

export default function PlayerSections({
  sections,
  pageSize = 5,
  selectedIds,
  onToggleSelect,
  onSelectPage,
  onToggleSection,
  onPageChange,
  onDownloadSingle,
  downloadingIds,
}) {
  const [activeAudio, setActiveAudio] = useState(null);
  const audioRef = useRef(null);

  const handleToggleAudio = (songId, previewUrl) => {
    if (audioRef.current) audioRef.current.pause();

    if (activeAudio === songId) {
      setActiveAudio(null);
      return;
    }

    audioRef.current = new Audio(previewUrl);
    audioRef.current.volume = 0.5;
    audioRef.current.play().catch(() => setActiveAudio(null));
    audioRef.current.onended = () => setActiveAudio(null);
    setActiveAudio(songId);
  };

  useEffect(() => () => {
    if (audioRef.current) audioRef.current.pause();
  }, []);

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto 40px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Object.entries(SECTION_META).map(([type, meta]) => {
        const section = sections[type];
        const Icon = meta.icon;
        const allItems = section.allItems || [];
        const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
        const currentPage = Math.min(section.page || 1, totalPages);
        const pageItems = allItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
                {(section.total || 0).toLocaleString()}
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

                {pageItems.length > 0 && (() => {
                  const allPageSelected = pageItems.every(s => selectedIds.has(s.id));
                  return (
                    <button
                      className="osu-btn-interactive"
                      onClick={() => {
                        osuAudio.playClick();
                        onSelectPage(pageItems.map(s => s.id), !allPageSelected);
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
                      {allPageSelected ? 'Deselect Page' : `Select All in Page (${pageItems.length})`}
                    </button>
                  );
                })()}

                {pageItems.map((song) => (
                  <BeatmapRow
                    key={`${type}-${song.id}`}
                    song={song}
                    isSelected={selectedIds.has(song.id)}
                    onToggleSelect={onToggleSelect}
                    onDownloadSingle={onDownloadSingle}
                    isDownloading={downloadingIds.has(song.id)}
                    activeAudio={activeAudio}
                    onToggleAudio={handleToggleAudio}
                  />
                ))}

                <SectionPagination
                  page={currentPage}
                  totalPages={totalPages}
                  onPageChange={(p) => onPageChange(type, p)}
                  disabled={section.isLoading}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
