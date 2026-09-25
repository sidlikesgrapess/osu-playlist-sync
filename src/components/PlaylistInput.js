'use client';

import { useState, useEffect } from 'react';
import { Loader2, Sparkles, ArrowRight, Plus, User } from 'lucide-react';
import { YouTubeIcon, SpotifyIcon, AppleMusicIcon, MusicNoteIcon } from './Icons';
import { osuAudio } from '@/lib/soundEffects';
import { strictnessLabel, strictnessSummary } from '@/lib/matchStrictness';
import { submitPlatform } from '@/lib/platform';

const GAME_MODES = [
  { id: 'all', label: 'All Modes', color: '#3d374a', activeText: '#ffffff', activeBorder: 'rgba(255, 255, 255, 0.2)' },
  { id: 'osu', label: 'osu!', color: '#ff66aa' },
  { id: 'taiko', label: 'osu!taiko', color: '#3399ff' },
  { id: 'fruits', label: 'osu!catch', color: '#00cc77' },
  { id: 'mania', label: 'osu!mania', color: '#9944ff' },
];

const STATUS_FILTERS = [
  { id: 'ranked', label: 'Ranked & Loved', color: '#44bbee', activeText: '#081a24' },
  { id: 'any', label: 'All (incl. Unranked)', color: '#ff66aa', activeText: '#ffffff' },
];

// The two segments of the search type toggle. Every link provider and plain text share one
// mode because the server classifies the text itself (extractors.js), so the old per provider
// entries only ever changed an icon. Labels and placeholders use no dash as punctuation.
const SEARCH_MODE_OPTIONS = [
  { id: 'songs', label: 'Playlist / Song', title: 'Search a playlist link, a track link or a song title', placeholder: 'Paste a YouTube, Spotify or Apple Music link, or type a song title...' },
  { id: 'player', label: 'Player', title: 'Search an osu! player', placeholder: 'Type an osu! player name or paste their profile link...' },
];

const SEARCH_MODE_BY_ID = Object.fromEntries(SEARCH_MODE_OPTIONS.map(o => [o.id, o]));

const SAMPLES = [
  { id: 'preset-youtube-banger', label: 'osu! Banger Showcase', value: 'https://www.youtube.com/playlist?list=PLosu_banger_showcase_01', icon: 'youtube', iconSize: 12 },
  { id: 'preset-spotify-top', label: 'Today’s Top Hits', value: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', icon: 'spotify', iconSize: 12 },
  { id: 'preset-single-song', label: 'YOASOBI - Idol', value: 'YOASOBI - Idol', icon: 'query', iconSize: 11 },
  { id: 'preset-player-mrekk', label: 'mrekk', value: 'mrekk', platform: 'player', icon: 'player', iconSize: 11 },
];

/** Shared look for the mode pills (rounded) and status pills (square). */
const pillStyle = (isActive, { color, activeText = '#ffffff', activeBorder, radius, fontSize }) => ({
  background: isActive ? color : '#272332',
  color: isActive ? activeText : '#c0b4c8',
  border: `1px solid ${isActive ? (activeBorder || color) : 'rgba(255, 255, 255, 0.06)'}`,
  borderRadius: radius,
  padding: '4px 10px',
  fontSize,
  fontWeight: 800,
  fontFamily: 'inherit',
});

// Greyed until the slider disagrees with what is on screen, so the button doubles as the
// readout for whether the current matches are stale.
const refetchButtonStyle = (enabled) => ({
  background: enabled ? '#ff66aa' : '#272332',
  color: enabled ? '#ffffff' : '#5f5768',
  border: `1px solid ${enabled ? '#ff66aa' : 'rgba(255, 255, 255, 0.06)'}`,
  borderRadius: '6px',
  padding: '5px 13px',
  fontSize: '0.72rem',
  fontWeight: 800,
  fontFamily: 'inherit',
  cursor: enabled ? 'pointer' : 'not-allowed',
  whiteSpace: 'nowrap',
  transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
});

const sampleButtonStyle = {
  background: '#231f2d',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '6px',
  color: '#ffffff',
  fontSize: '0.72rem',
  fontWeight: 800,
  padding: '4px 9px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  fontFamily: 'inherit',
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

// `searchMode` ('songs' | 'player') is owned by page.js, because it is also which result set
// is on screen (todo item 09). Flipping it never fetches or drops anything.
export default function PlaylistInput({ onFetch, isLoading, hasSongs, searchMode, onSearchModeChange, mode, setMode, statusFilter, setStatusFilter, matchThreshold, setMatchThreshold, canRefetchStrictness, onStrictnessRefetch }) {
  const [url, setUrl] = useState('');
  const [isDocked, setIsDocked] = useState(false);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsDocked(window.scrollY > 180);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  // The same host classification the server uses (platform.js), so the icon never names a
  // provider the server would refuse: a link is judged by its own host, not by a provider
  // name appearing anywhere in the text.
  const activePlatform = submitPlatform(searchMode, url);
  // What the Playlist / Song segment shows: the provider it detected, or sparkles for nothing
  // yet. A profile link is detected as the player even in this mode, since page.js routes it.
  const songsIcon = submitPlatform('songs', url);

  const getPlatformIcon = (plat, size = 18) => {
    switch (plat) {
      case 'youtube':
        return <YouTubeIcon size={size} color="#ff3333" />;
      case 'spotify':
        return <SpotifyIcon size={size} color="#1db954" />;
      case 'apple':
        return <AppleMusicIcon size={size} color="#fc3c44" />;
      case 'query':
        return <MusicNoteIcon size={size} color="#ff66aa" />;
      case 'player':
        return <User size={size} color="#44bbee" />;
      default:
        return <Sparkles size={size} color="#ff66aa" />;
    }
  };

  const getPlaceholder = () => {
    if (searchMode === 'player') return SEARCH_MODE_BY_ID.player.placeholder;
    if (hasSongs) return 'Paste another link or type a song to add to the list...';
    return SEARCH_MODE_BY_ID.songs.placeholder;
  };

  const handleSearchModeChange = (nextMode) => {
    if (nextMode === searchMode) return;
    onSearchModeChange(nextMode);
    osuAudio.playClick();
  };

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const inputVal = url.trim();
    if (!inputVal) return;
    osuAudio.playClick();
    onFetch(inputVal, activePlatform);
    if (hasSongs) setUrl('');
  };

  const handleQuickSample = (sampleVal, platform = 'auto') => {
    setUrl(sampleVal);
    // The toggle follows the sample (page.js sets it from the submission), so a later typed
    // search goes where the sample went.
    osuAudio.playClick();
    onFetch(sampleVal, platform);
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    osuAudio.playClick();
  };

  const handleStatusChange = (newStatus) => {
    setStatusFilter(newStatus);
    osuAudio.playClick();
  };

  return (
    <div style={{
      maxWidth: '1240px',
      margin: '0 auto 18px',
      position: 'sticky',
      top: '56px',
      zIndex: 45,
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <div style={{
        background: isDocked ? '#181620' : '#1e1c26',
        border: `1px solid ${isDocked ? 'rgba(255, 102, 170, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
        borderRadius: '10px',
        boxShadow: isDocked
          ? '0 12px 32px rgba(0, 0, 0, 0.6)'
          : '0 4px 20px rgba(0, 0, 0, 0.35)',
        padding: isDocked ? '10px 16px' : '16px 20px',
        transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: isDocked ? '8px' : '12px' }}>
          
          {/* Mode Selector & Status Tabs */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            borderBottom: isDocked ? 'none' : '1px solid rgba(255, 255, 255, 0.07)',
            paddingBottom: isDocked ? '0' : '10px',
            transition: 'all 0.25s ease',
          }}>
            {/* Game Modes */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase', marginRight: '4px' }}>
                Mode:
              </span>
              {GAME_MODES.map(({ id, label, color, activeText, activeBorder }) => (
                <button
                  key={id}
                  type="button"
                  className="osu-pill-tab"
                  onClick={() => handleModeChange(id)}
                  onMouseEnter={() => osuAudio.playHover()}
                  style={pillStyle(mode === id, { color, activeText, activeBorder, radius: '9999px', fontSize: '0.76rem' })}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Status Filter buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '0.72rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase', marginRight: '4px' }}>
                Status:
              </span>
              {STATUS_FILTERS.map(({ id, label, color, activeText }) => (
                <button
                  key={id}
                  id={`status-${id === 'any' ? 'all' : id}-btn`}
                  type="button"
                  className="osu-pill-tab"
                  onClick={() => handleStatusChange(id)}
                  onMouseEnter={() => osuAudio.playHover()}
                  style={pillStyle(statusFilter === id, { color, activeText, radius: '5px', fontSize: '0.74rem' })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Match Strictness.
              One full-width line: caption, then the slider taking every pixel left over,
              then the reading, then Refetch pinned to the right edge. The slider used to
              be a fixed 220px at the far left, which left most of the row empty on a wide
              window and made the three controls look unrelated to each other. */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap',
            borderBottom: isDocked ? 'none' : '1px solid rgba(255, 255, 255, 0.07)',
            paddingBottom: isDocked ? '0' : '10px',
            transition: 'all 0.25s ease',
          }}>
            <span style={{
              flex: '0 0 auto',
              fontSize: '0.72rem',
              color: '#887c93',
              fontWeight: 800,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              Match Strictness
            </span>

            {/* The elastic member: it absorbs the width the row does not otherwise use,
                so nothing to its right ever shifts when a label changes length. */}
            <input
              id="match-strictness-slider"
              className="osu-strictness"
              type="range"
              min={0}
              max={100}
              step={25}
              value={matchThreshold}
              aria-label="Match strictness"
              aria-valuetext={`${matchThreshold} of 100, ${strictnessLabel(matchThreshold)}: ${strictnessSummary(matchThreshold)}`}
              onChange={(e) => {
                osuAudio.playClick();
                setMatchThreshold(Number(e.target.value));
              }}
              style={{ '--fill': `${matchThreshold}%`, flex: '1 1 180px', minWidth: '140px' }}
            />

            {/* Right-aligned and fixed-width: the summary is the longest thing on the row
                and the widest reading sets the column, so the button never shuffles. */}
            <div style={{ flex: '0 0 auto', width: '240px', textAlign: 'right' }}>
              <div style={{ fontSize: '0.72rem', color: '#c6b8ce', fontWeight: 800, textTransform: 'uppercase' }}>
                {strictnessLabel(matchThreshold)}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#6f6578', fontWeight: 600, marginTop: '2px' }}>
                {strictnessSummary(matchThreshold)}
              </div>
            </div>

            <button
              id="strictness-refetch-btn"
              type="button"
              disabled={!canRefetchStrictness}
              onClick={() => {
                osuAudio.playClick();
                onStrictnessRefetch?.();
              }}
              onMouseEnter={() => canRefetchStrictness && osuAudio.playHover()}
              title={canRefetchStrictness
                ? 'Search again at this strictness'
                : 'Move the slider to search again at a new strictness'}
              style={refetchButtonStyle(canRefetchStrictness)}
            >
              Refetch
            </button>
          </div>

          {/* Clean Solid Search Bar with the search type toggle */}
          <div className="pi-search-bar" style={{
            display: 'flex',
            alignItems: 'center',
            background: '#141318',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '8px',
            padding: '4px 6px',
            gap: '6px',
            position: 'relative',
            zIndex: 40,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}>
            {/* Search type toggle: one click switches, there is no menu to open. */}
            <div
              role="radiogroup"
              aria-label="Search type"
              className="pi-search-mode"
              style={{
                display: 'flex',
                alignItems: 'stretch',
                flexShrink: 0,
                background: '#23202c',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '2px',
                gap: '2px',
                minHeight: '34px',
                boxSizing: 'border-box',
              }}
            >
              {SEARCH_MODE_OPTIONS.map(({ id, label, title }) => {
                const isActive = searchMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    id={`search-mode-${id}-btn`}
                    role="radio"
                    aria-checked={isActive}
                    data-detected={id === 'songs' ? songsIcon : undefined}
                    className="pi-search-mode-btn"
                    onClick={() => handleSearchModeChange(id)}
                    onMouseEnter={() => osuAudio.playHover()}
                    title={title}
                    style={{
                      background: isActive ? '#3a2d44' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(255, 102, 170, 0.55)' : 'transparent'}`,
                      borderRadius: '4px',
                      padding: '3px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer',
                      color: isActive ? '#ffffff' : '#9d90a8',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                      transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                    }}
                  >
                    <span className="pi-search-mode-icon" style={{ display: 'inline-flex', opacity: isActive ? 1 : 0.6 }}>
                      {getPlatformIcon(id === 'songs' ? songsIcon : 'player', 14)}
                    </span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* URL / Query Input */}
            <input
              id="playlist-url-input"
              type="text"
              placeholder={getPlaceholder()}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              disabled={isLoading}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.84rem',
                outline: 'none',
                fontFamily: 'inherit',
                fontWeight: 600,
                padding: '4px 2px',
              }}
            />
            {url && (
              <button
                type="button"
                className="pi-clear-btn"
                onClick={() => setUrl('')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8b7d95',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 4px',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                Clear
              </button>
            )}
            <button
              id="find-beatmaps-btn"
              type="submit"
              disabled={isLoading}
              className="osu-btn-interactive osu-btn-pink"
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                border: 'none',
                fontWeight: 800,
                fontSize: '0.78rem',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: isLoading || !url.trim() ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                opacity: isLoading || !url.trim() ? 0.6 : 1,
                fontFamily: 'inherit',
                flexShrink: 0,
                minHeight: '34px',
                whiteSpace: 'nowrap',
              }}
              title={hasSongs ? 'Add this to your current list without losing existing results' : undefined}
            >
              {isLoading ? (
                <>
                  <Loader2 size={13} className="spin-slow" />
                  <span className="pi-submit-label">{hasSongs ? 'Adding...' : 'Searching...'}</span>
                </>
              ) : hasSongs ? (
                <>
                  <Plus size={13} />
                  <span className="pi-submit-label">Add More Songs</span>
                </>
              ) : (
                <>
                  <span className="pi-submit-label">Find</span>
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          </div>

          {/* Smooth Collapsible Sample Playlists Bar - Touch Scrollable on Mobile */}
          <div 
            className="no-scrollbar"
            style={{
              maxHeight: isDocked ? '0px' : '52px',
              opacity: isDocked ? 0 : 1,
              transform: isDocked ? 'translateY(-6px)' : 'translateY(0)',
              marginTop: isDocked ? '0px' : '4px',
              overflowX: 'auto',
              overflowY: 'hidden',
              WebkitOverflowScrolling: 'touch',
              pointerEvents: isDocked ? 'none' : 'auto',
              transition: 'max-height 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease, transform 0.25s ease, margin 0.32s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexWrap: 'nowrap',
              paddingBottom: '2px',
            }}
          >
            <span style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 800, flexShrink: 0 }}>
              Try sample:
            </span>
            {SAMPLES.map(({ id, label, value, platform, icon, iconSize }) => (
              <button
                key={id}
                id={id}
                type="button"
                className="osu-btn-interactive"
                onClick={() => handleQuickSample(value, platform || 'auto')}
                onMouseEnter={() => osuAudio.playHover()}
                style={sampleButtonStyle}
              >
                {getPlatformIcon(icon, iconSize)}
                <span>{label}</span>
              </button>
            ))}
          </div>

        </form>
      </div>
    </div>
  );
}
