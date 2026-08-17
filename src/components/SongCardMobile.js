'use client';

import { useState } from 'react';
import { Play, Download, ExternalLink, Loader2, Music, Layers, Edit3, Check, X } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';
import OsuCheckbox from './OsuCheckbox';

export default function SongCardMobile({
  song,
  isSelected,
  onToggleSelect,
  activeAudio,
  onToggleAudio,
  onDownloadSingle,
  isDownloading,
  onOpenAltPicker,
  onManualSearch,
}) {
  const [isEditingQuery, setIsEditingQuery] = useState(false);
  const [customQuery, setCustomQuery] = useState(song.cleanQuery || song.title || '');
  const [imgError, setImgError] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  const isPlaying = activeAudio === song.id;
  const match = song.matchedBeatmap;
  const hasMatch = Boolean(match);

  const getStarColor = (stars) => {
    if (!stars) return '#c6b8ce';
    if (stars < 2.5) return '#4fc3f7';
    if (stars < 4.0) return '#81c784';
    if (stars < 5.3) return '#ffb74d';
    if (stars < 6.5) return '#ff8a80';
    return '#ba68c8';
  };

  const handleQuerySubmit = (e) => {
    e.preventDefault();
    if (!customQuery.trim()) return;
    osuAudio.playClick();
    setIsEditingQuery(false);
    onManualSearch(song.id, customQuery.trim());
  };

  return (
    <div
      className="osu-glass-card"
      style={{
        borderRadius: '10px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        background: isSelected && hasMatch ? 'rgba(46, 30, 48, 0.75)' : 'rgba(30, 27, 38, 0.65)',
        border: `1px solid ${isSelected && hasMatch ? 'rgba(255, 102, 170, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
        boxShadow: isSelected && hasMatch ? '0 0 16px rgba(255, 102, 170, 0.2)' : '0 2px 10px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* Top Bar: Checkbox + Number + YouTube Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flexShrink: 0 }}>
          <OsuCheckbox
            id={`checkbox-mobile-song-${song.id}`}
            checked={isSelected && hasMatch}
            disabled={!hasMatch}
            onChange={() => {
              if (hasMatch) {
                osuAudio.playClick();
                onToggleSelect(song.id);
              }
            }}
            title={hasMatch ? 'Select beatmap' : 'Beatmap match required'}
          />
        </div>

        <span style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 800, minWidth: '18px' }}>
          #{song.position !== undefined ? song.position + 1 : song.index}
        </span>

        {/* Thumbnail */}
        <div className="osu-thumb-container" style={{ width: '42px', height: '28px', borderRadius: '4px', flexShrink: 0 }}>
          {song.thumbnail && !thumbError ? (
            <img
              src={song.thumbnail}
              alt={song.title}
              onError={() => setThumbError(true)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              background: '#343040',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Music size={12} color="#8b7d95" />
            </div>
          )}
        </div>

        {/* Title & Artist */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: '0.82rem',
            fontWeight: 800,
            color: '#ffffff',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }} title={song.title}>
            {song.title}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#8b7d95', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {song.channelTitle || 'Source Track'}
          </div>
        </div>
      </div>

      {/* Query Tag with Inline Edit on Mobile */}
      {isEditingQuery ? (
        <form onSubmit={handleQuerySubmit} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              background: '#18171c',
              border: '1px solid #ff66aa',
              borderRadius: '4px',
              color: '#ffffff',
              fontSize: '0.74rem',
              padding: '4px 6px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            style={{
              background: '#ff66aa',
              border: 'none',
              borderRadius: '4px',
              color: '#ffffff',
              padding: '5px 8px',
              cursor: 'pointer',
            }}
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={() => setIsEditingQuery(false)}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '4px',
              color: '#8b7d95',
              padding: '5px 8px',
              cursor: 'pointer',
            }}
          >
            <X size={12} />
          </button>
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{
            fontSize: '0.66rem',
            color: '#3399ff',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(51, 153, 255, 0.1)',
            padding: '2px 6px',
            borderRadius: '4px',
            fontWeight: 700,
            maxWidth: '100%',
            overflow: 'hidden',
          }}>
            <span>Query:</span>
            <span className="mono-font" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {song.cleanQuery}
            </span>
          </span>
          <button
            onClick={() => setIsEditingQuery(true)}
            title="Edit keywords"
            style={{
              background: 'none',
              border: 'none',
              color: '#3399ff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
            }}
          >
            <Edit3 size={11} />
          </button>
        </div>
      )}

      {/* Matched Beatmap Body */}
      {song.isSearching ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ffcc22', fontSize: '0.76rem', fontWeight: 700, padding: '4px 0' }}>
          <Loader2 size={13} className="spin-slow" />
          <span>Searching beatmaps...</span>
        </div>
      ) : hasMatch ? (
        <div style={{
          background: 'rgba(18, 16, 24, 0.65)',
          borderRadius: '8px',
          padding: '8px 10px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          gap: '10px',
          alignItems: 'center',
        }}>
          {/* Cover with Play Preview */}
          <div
            className="osu-thumb-container"
            style={{
              width: '60px',
              height: '40px',
              borderRadius: '6px',
              flexShrink: 0,
              background: '#343040',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {!imgError ? (
              <img
                src={match.covers?.list || match.covers?.cover || `https://assets.ppy.sh/beatmaps/${match.id}/covers/list.jpg`}
                alt={match.title}
                onError={() => setImgError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Music size={14} color="#ff66aa" />
              </div>
            )}
            <button
              className="osu-play-btn"
              onClick={() => {
                osuAudio.playClick();
                onToggleAudio(song.id, match.previewUrl);
              }}
              style={{
                position: 'absolute',
                inset: 0,
                background: isPlaying ? 'rgba(16, 14, 22, 0.75)' : 'rgba(0, 0, 0, 0.35)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title={isPlaying ? 'Pause' : 'Play preview'}
            >
              {isPlaying ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <div className="osu-wave-bar" style={{ width: '2.5px' }} />
                  <div className="osu-wave-bar" style={{ width: '2.5px' }} />
                  <div className="osu-wave-bar" style={{ width: '2.5px' }} />
                </div>
              ) : (
                <Play size={13} color="#ffffff" />
              )}
            </button>
          </div>

          {/* Details */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>
                {match.artist} - {match.title}
              </span>
              <span style={{
                fontSize: '0.62rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                padding: '1px 5px',
                borderRadius: '3px',
                background:
                  match.status === 'ranked' ? '#44bbee' :
                  match.status === 'loved' ? '#ff66aa' :
                  match.status === 'qualified' ? '#3399ff' :
                  match.status === 'pending' ? '#ffcc22' :
                  '#5a5266',
                color: (match.status === 'ranked' || match.status === 'pending') ? '#081a24' : '#ffffff',
              }}>
                {match.status}
              </span>
            </div>

            <div style={{ fontSize: '0.68rem', color: '#c6b8ce', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <span>by <strong style={{ color: '#ffffff' }}>{match.creator}</strong></span>
              <span>•</span>
              <span>{match.bpm} BPM</span>
              <span>•</span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 700,
                fontSize: '0.66rem',
                padding: '1px 4px',
                borderRadius: '3px',
                background: 'rgba(0, 0, 0, 0.4)',
                color: getStarColor(match.starRange?.max),
              }}>
                ★ {match.starRange?.min?.toFixed(1)}-{match.starRange?.max?.toFixed(1)}
              </span>
            </div>
          </div>
        </div>
      ) : song.hasSearched === false ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
          <span style={{ color: '#8b7d95', fontSize: '0.74rem', fontWeight: 600 }}>Not searched yet</span>
          <button
            onClick={() => onManualSearch(song.id, song.cleanQuery || song.title)}
            className="osu-btn-interactive osu-glass-card"
            style={{
              color: '#ff66aa',
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Search
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}>
          <span style={{ color: '#8b7d95', fontSize: '0.74rem', fontWeight: 600 }}>No beatmap found</span>
          <button
            onClick={() => setIsEditingQuery(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ff66aa',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Edit keywords
          </button>
        </div>
      )}

      {/* Card Footer: Alternatives + Actions */}
      {hasMatch && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', flexWrap: 'wrap', gap: '6px' }}>
          {song.allMatches && song.allMatches.length > 1 ? (
            <button
              onClick={() => {
                osuAudio.playClick();
                onOpenAltPicker(song);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#ff66aa',
                fontSize: '0.68rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: 0,
                textDecoration: 'underline',
                fontFamily: 'inherit',
              }}
            >
              <Layers size={10} />
              <span>{song.allMatches.length} versions (change)</span>
            </button>
          ) : <div />}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
            <a
              href={`https://osu.ppy.sh/beatmapsets/${match.id}`}
              target="_blank"
              rel="noreferrer"
              className="osu-btn-interactive"
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#c6b8ce',
                padding: '6px 8px',
                borderRadius: '5px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                minHeight: '32px',
              }}
              title="View on osu! web"
            >
              <ExternalLink size={12} />
            </a>

            <button
              className="osu-btn-interactive osu-btn-pink"
              onClick={() => {
                osuAudio.playClick();
                onDownloadSingle(song);
              }}
              disabled={isDownloading}
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                border: 'none',
                padding: '6px 12px',
                borderRadius: '5px',
                fontSize: '0.74rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontFamily: 'inherit',
                minHeight: '32px',
              }}
              title="Download .osz file"
            >
              {isDownloading ? (
                <>
                  <Loader2 size={11} className="spin-slow" />
                  <span>Fetching...</span>
                </>
              ) : (
                <>
                  <Download size={11} />
                  <span>.OSZ</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
