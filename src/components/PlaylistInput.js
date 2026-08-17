'use client';

import { useState, useEffect } from 'react';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { YouTubeIcon } from './Icons';
import { osuAudio } from '@/lib/soundEffects';

export default function PlaylistInput({ onFetch, isLoading, mode, setMode, statusFilter, setStatusFilter }) {
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
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubmit = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const inputVal = url.trim() || (typeof document !== 'undefined' ? document.getElementById('playlist-url-input')?.value?.trim() : '');
    if (!inputVal) return;
    osuAudio.playClick();
    onFetch(inputVal);
  };

  const handleQuickSample = (sampleUrl) => {
    setUrl(sampleUrl);
    osuAudio.playClick();
    onFetch(sampleUrl);
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
        background: isDocked ? 'rgba(20, 17, 26, 0.95)' : 'rgba(28, 25, 36, 0.65)',
        backdropFilter: isDocked ? 'blur(24px) saturate(180%)' : 'blur(16px) saturate(150%)',
        WebkitBackdropFilter: isDocked ? 'blur(24px) saturate(180%)' : 'blur(16px) saturate(150%)',
        border: `1px solid ${isDocked ? 'rgba(255, 102, 170, 0.5)' : 'rgba(255, 255, 255, 0.09)'}`,
        borderRadius: '10px',
        boxShadow: isDocked
          ? '0 16px 40px rgba(0, 0, 0, 0.75), 0 0 24px rgba(255, 102, 170, 0.2)'
          : '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        padding: isDocked ? '10px 16px' : '16px 20px',
        transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: isDocked ? '8px' : '12px' }}>
          
          {/* Mode Selector Tabs (official osu!web / lazer frosted style) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            borderBottom: isDocked ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: isDocked ? '0' : '10px',
            transition: 'all 0.25s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 800, textTransform: 'uppercase', marginRight: '4px' }}>
                Mode:
              </span>
              <button
                type="button"
                className="osu-pill-tab"
                onClick={() => handleModeChange('all')}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  background: mode === 'all' ? 'rgba(74, 68, 91, 0.85)' : 'rgba(255, 255, 255, 0.05)',
                  color: mode === 'all' ? '#ffffff' : '#c6b8ce',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
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
                  background: mode === 'osu' ? '#ff66aa' : 'rgba(255, 255, 255, 0.05)',
                  color: mode === 'osu' ? '#ffffff' : '#c6b8ce',
                  border: `1px solid ${mode === 'osu' ? '#ff66aa' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  boxShadow: mode === 'osu' ? '0 0 14px rgba(255, 102, 170, 0.5)' : 'none',
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
                  background: mode === 'taiko' ? '#3399ff' : 'rgba(255, 255, 255, 0.05)',
                  color: mode === 'taiko' ? '#ffffff' : '#c6b8ce',
                  border: `1px solid ${mode === 'taiko' ? '#3399ff' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  boxShadow: mode === 'taiko' ? '0 0 14px rgba(51, 153, 255, 0.5)' : 'none',
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
                  background: mode === 'fruits' ? '#00dd88' : 'rgba(255, 255, 255, 0.05)',
                  color: mode === 'fruits' ? '#ffffff' : '#c6b8ce',
                  border: `1px solid ${mode === 'fruits' ? '#00dd88' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  boxShadow: mode === 'fruits' ? '0 0 14px rgba(0, 221, 136, 0.5)' : 'none',
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
                  background: mode === 'mania' ? '#9944ff' : 'rgba(255, 255, 255, 0.05)',
                  color: mode === 'mania' ? '#ffffff' : '#c6b8ce',
                  border: `1px solid ${mode === 'mania' ? '#9944ff' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '9999px',
                  padding: '4px 10px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  boxShadow: mode === 'mania' ? '0 0 14px rgba(153, 68, 255, 0.5)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                osu!mania
              </button>
            </div>

            {/* Status Filter buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 800, textTransform: 'uppercase', marginRight: '4px' }}>
                Status:
              </span>
              <button
                id="status-ranked-btn"
                type="button"
                className="osu-pill-tab"
                onClick={() => handleStatusChange('ranked')}
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  background: statusFilter === 'ranked' ? '#44bbee' : 'rgba(255, 255, 255, 0.06)',
                  color: statusFilter === 'ranked' ? '#081a24' : '#c6b8ce',
                  border: `1px solid ${statusFilter === 'ranked' ? '#44bbee' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '5px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  boxShadow: statusFilter === 'ranked' ? '0 0 12px rgba(68, 187, 238, 0.5)' : 'none',
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
                  background: statusFilter === 'any' ? '#ff66aa' : 'rgba(255, 255, 255, 0.06)',
                  color: statusFilter === 'any' ? '#ffffff' : '#c6b8ce',
                  border: `1px solid ${statusFilter === 'any' ? '#ff66aa' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '5px',
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  boxShadow: statusFilter === 'any' ? '0 0 12px rgba(255, 102, 170, 0.5)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                All (incl. Unranked)
              </button>
            </div>
          </div>

          {/* Frosted Liquid Glass Search URL Input Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(16, 14, 22, 0.75)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '2px solid rgba(255, 102, 170, 0.85)',
            borderRadius: '8px',
            padding: '4px 6px 4px 12px',
            gap: '10px',
            boxShadow: '0 0 16px rgba(255, 102, 170, 0.35)',
          }}>
            <YouTubeIcon size={18} color="#ff3333" style={{ flexShrink: 0 }} />
            <input
              id="playlist-url-input"
              type="text"
              placeholder="Paste any YouTube playlist link..."
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
                background: 'transparent',
                border: 'none',
                color: '#ffffff',
                fontSize: '0.88rem',
                outline: 'none',
                fontFamily: 'inherit',
                fontWeight: 600,
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
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  fontFamily: 'inherit',
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
                fontSize: '0.82rem',
                padding: '7px 16px',
                borderRadius: '5px',
                cursor: isLoading || !url.trim() ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: isLoading || !url.trim() ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={14} className="spin-slow" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <span>Find Beatmaps</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>

          {/* Smooth Collapsible Sample Playlists Bar */}
          <div style={{
            maxHeight: isDocked ? '0px' : '44px',
            opacity: isDocked ? 0 : 1,
            transform: isDocked ? 'translateY(-6px)' : 'translateY(0)',
            marginTop: isDocked ? '0px' : '2px',
            overflow: 'hidden',
            pointerEvents: isDocked ? 'none' : 'auto',
            transition: 'max-height 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s ease, transform 0.25s ease, margin 0.32s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '0.74rem', color: '#8b7d95', fontWeight: 800 }}>
              Try sample playlists:
            </span>
            <button
              type="button"
              className="osu-btn-interactive osu-glass-card"
              onClick={() => handleQuickSample('https://www.youtube.com/playlist?list=PLosu_banger_showcase_01')}
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.74rem',
                fontWeight: 800,
                padding: '4px 10px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontFamily: 'inherit',
              }}
            >
              <Sparkles size={11} color="#ff66aa" />
              <span>osu! Banger Showcase</span>
            </button>
            <button
              id="preset-metal-rock"
              type="button"
              className="osu-btn-interactive osu-glass-card"
              onClick={() => handleQuickSample('https://youtube.com/playlist?list=PLJU2iuLr5pzw3qUnvmxiOaY2dwBxGSMSM')}
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                borderRadius: '6px',
                color: '#ffffff',
                fontSize: '0.74rem',
                fontWeight: 800,
                padding: '4px 10px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontFamily: 'inherit',
              }}
            >
              <Sparkles size={11} color="#3399ff" />
              <span>metal scratches rock (16 songs)</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
