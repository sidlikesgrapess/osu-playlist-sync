'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Sparkles, ArrowRight, ChevronDown } from 'lucide-react';
import { YouTubeIcon, SpotifyIcon, AppleMusicIcon, MusicNoteIcon } from './Icons';
import { osuAudio } from '@/lib/soundEffects';

export default function PlaylistInput({ onFetch, isLoading, mode, setMode, statusFilter, setStatusFilter }) {
  const [url, setUrl] = useState('');
  const [isDocked, setIsDocked] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('auto');
  const [isPlatformMenuOpen, setIsPlatformMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMenuPos = () => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const menuWidth = 228;
      const maxLeft = typeof window !== 'undefined' ? Math.max(8, window.innerWidth - menuWidth - 10) : rect.left;
      const left = Math.max(8, Math.min(rect.left, maxLeft));
      setMenuPos({ top: rect.bottom + 6, left });
    }
  };

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsDocked(window.scrollY > 180);
          if (isPlatformMenuOpen) updateMenuPos();
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
  }, [isPlatformMenuOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      const portalEl = document.getElementById('platform-dropdown-portal-menu');
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        (!portalEl || !portalEl.contains(e.target))
      ) {
        setIsPlatformMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine active display icon based on user selection or auto-detection
  const detectPlatform = () => {
    if (selectedPlatform !== 'auto') return selectedPlatform;
    const lower = url.toLowerCase().trim();
    if (lower.includes('spotify.com')) return 'spotify';
    if (lower.includes('music.apple.com')) return 'apple';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    if (lower.length > 0 && !lower.startsWith('http')) return 'query';
    return 'auto';
  };

  const activePlatform = detectPlatform();

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
      default:
        return <Sparkles size={size} color="#ff66aa" />;
    }
  };

  const getPlatformName = (plat) => {
    switch (plat) {
      case 'youtube': return 'YouTube';
      case 'spotify': return 'Spotify';
      case 'apple': return 'Apple Music';
      case 'query': return 'Single Song';
      default: return 'Auto Detect';
    }
  };

  const getPlaceholder = () => {
    switch (selectedPlatform) {
      case 'youtube': return 'Paste YouTube playlist link or video URL...';
      case 'spotify': return 'Paste Spotify playlist, album, or track link...';
      case 'apple': return 'Paste Apple Music playlist, album, or song link...';
      case 'query': return 'Type song and artist name (e.g. YOASOBI - Idol)...';
      default: return 'Paste YouTube, Spotify, Apple Music link, or type song title...';
    }
  };

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const inputVal = url.trim() || (typeof document !== 'undefined' ? document.getElementById('playlist-url-input')?.value?.trim() : '');
    if (!inputVal) return;
    osuAudio.playClick();
    onFetch(inputVal);
  };

  const handleQuickSample = (sampleVal) => {
    setUrl(sampleVal);
    osuAudio.playClick();
    onFetch(sampleVal);
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
              <button
                type="button"
                className="osu-pill-tab"
                onClick={() => handleModeChange('all')}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  background: mode === 'all' ? '#3d374a' : '#272332',
                  color: mode === 'all' ? '#ffffff' : '#c0b4c8',
                  border: `1px solid ${mode === 'all' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  fontFamily: 'inherit',
                }}
              >
                All Modes
              </button>
              <button
                type="button"
                className="osu-pill-tab"
                onClick={() => handleModeChange('osu')}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  background: mode === 'osu' ? '#ff66aa' : '#272332',
                  color: mode === 'osu' ? '#ffffff' : '#c0b4c8',
                  border: `1px solid ${mode === 'osu' ? '#ff66aa' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  fontFamily: 'inherit',
                }}
              >
                osu!
              </button>
              <button
                type="button"
                className="osu-pill-tab"
                onClick={() => handleModeChange('taiko')}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  background: mode === 'taiko' ? '#3399ff' : '#272332',
                  color: mode === 'taiko' ? '#ffffff' : '#c0b4c8',
                  border: `1px solid ${mode === 'taiko' ? '#3399ff' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  fontFamily: 'inherit',
                }}
              >
                osu!taiko
              </button>
              <button
                type="button"
                className="osu-pill-tab"
                onClick={() => handleModeChange('fruits')}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  background: mode === 'fruits' ? '#00cc77' : '#272332',
                  color: mode === 'fruits' ? '#ffffff' : '#c0b4c8',
                  border: `1px solid ${mode === 'fruits' ? '#00cc77' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  fontFamily: 'inherit',
                }}
              >
                osu!catch
              </button>
              <button
                type="button"
                className="osu-pill-tab"
                onClick={() => handleModeChange('mania')}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  background: mode === 'mania' ? '#9944ff' : '#272332',
                  color: mode === 'mania' ? '#ffffff' : '#c0b4c8',
                  border: `1px solid ${mode === 'mania' ? '#9944ff' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  fontFamily: 'inherit',
                }}
              >
                osu!mania
              </button>
            </div>

            {/* Status Filter buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '0.72rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase', marginRight: '4px' }}>
                Status:
              </span>
              <button
                id="status-ranked-btn"
                type="button"
                className="osu-pill-tab"
                onClick={() => handleStatusChange('ranked')}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  background: statusFilter === 'ranked' ? '#44bbee' : '#272332',
                  color: statusFilter === 'ranked' ? '#081a24' : '#c0b4c8',
                  border: `1px solid ${statusFilter === 'ranked' ? '#44bbee' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: '5px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  fontFamily: 'inherit',
                }}
              >
                Ranked & Loved
              </button>
              <button
                id="status-all-btn"
                type="button"
                className="osu-pill-tab"
                onClick={() => handleStatusChange('any')}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  background: statusFilter === 'any' ? '#ff66aa' : '#272332',
                  color: statusFilter === 'any' ? '#ffffff' : '#c0b4c8',
                  border: `1px solid ${statusFilter === 'any' ? '#ff66aa' : 'rgba(255, 255, 255, 0.06)'}`,
                  borderRadius: '5px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  fontFamily: 'inherit',
                }}
              >
                All (incl. Unranked)
              </button>
            </div>
          </div>

          {/* Clean Solid Search Bar with Platform Dropdown */}
          <div style={{
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
            {/* Platform Dropdown Trigger */}
            <div ref={menuRef} style={{ position: 'relative', zIndex: 50, flexShrink: 0 }}>
              <button
                type="button"
                id="platform-dropdown-btn"
                className="osu-btn-interactive"
                onClick={() => {
                  osuAudio.playClick();
                  updateMenuPos();
                  setIsPlatformMenuOpen(prev => !prev);
                }}
                style={{
                  background: '#23202c',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  color: '#ffffff',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  fontFamily: 'inherit',
                  minHeight: '34px',
                }}
                title="Select source platform"
              >
                {getPlatformIcon(activePlatform, 15)}
                <span style={{ fontSize: '0.72rem', display: 'inline-block' }}>{getPlatformName(selectedPlatform)}</span>
                <ChevronDown size={11} color="#887c93" />
              </button>

              {/* Solid Clean Dropdown Menu rendered via Portal */}
              {isPlatformMenuOpen && mounted && createPortal(
                <div
                  id="platform-dropdown-portal-menu"
                  style={{
                    position: 'fixed',
                    top: `${menuPos.top}px`,
                    left: `${menuPos.left}px`,
                    width: '228px',
                    maxWidth: 'calc(100vw - 16px)',
                    background: '#1d1a26',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.65)',
                    padding: '5px',
                    zIndex: 999999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                  }}
                >
                  {[
                    { id: 'auto', label: 'Auto Detect (Any Link)', icon: 'auto' },
                    { id: 'youtube', label: 'YouTube (Playlist/Track)', icon: 'youtube' },
                    { id: 'spotify', label: 'Spotify (Playlist/Track)', icon: 'spotify' },
                    { id: 'apple', label: 'Apple Music (Playlist/Song)', icon: 'apple' },
                    { id: 'query', label: 'Single Song Search', icon: 'query' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="osu-btn-interactive"
                      onClick={() => {
                        setSelectedPlatform(item.id);
                        setIsPlatformMenuOpen(false);
                        osuAudio.playClick();
                      }}
                      style={{
                        background: selectedPlatform === item.id ? '#2e2638' : 'transparent',
                        border: selectedPlatform === item.id ? '1px solid rgba(255, 102, 170, 0.4)' : '1px solid transparent',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        color: selectedPlatform === item.id ? '#ffffff' : '#c6b8ce',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                    >
                      {getPlatformIcon(item.icon, 16)}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>,
                document.body
              )}
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
            >
              {isLoading ? (
                <>
                  <Loader2 size={13} className="spin-slow" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <span>Find</span>
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
            <button
              id="preset-youtube-banger"
              type="button"
              className="osu-btn-interactive osu-glass-card"
              onClick={() => handleQuickSample('https://www.youtube.com/playlist?list=PLosu_banger_showcase_01')}
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontFamily: 'inherit',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <YouTubeIcon size={12} color="#ff3333" />
              <span>osu! Banger Showcase</span>
            </button>
            <button
              id="preset-spotify-top"
              type="button"
              className="osu-btn-interactive osu-glass-card"
              onClick={() => handleQuickSample('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')}
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontFamily: 'inherit',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <SpotifyIcon size={12} color="#1db954" />
              <span>Today’s Top Hits</span>
            </button>
            <button
              id="preset-single-song"
              type="button"
              className="osu-btn-interactive osu-glass-card"
              onClick={() => handleQuickSample('YOASOBI - Idol')}
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '4px 8px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontFamily: 'inherit',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <MusicNoteIcon size={11} color="#ff66aa" />
              <span>YOASOBI - Idol</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
