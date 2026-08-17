'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Download } from 'lucide-react';
import { YouTubeIcon } from './Icons';
import { osuAudio } from '@/lib/soundEffects';
import HitCircleEaster from './HitCircleEaster';

export default function Hero({ onTryDemo }) {
  const [scrollY, setScrollY] = useState(0);
  const easterRef = useRef(null);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Linear progress from 0 to 1 as user scrolls 0 -> 140px
  const progress = Math.min(1, Math.max(0, scrollY / 130));
  const heroBrandOpacity = Math.max(0, 1 - progress * 1.3);
  const heroBrandY = -scrollY * 0.5;
  const heroBrandScale = 1 - progress * 0.22;

  const handleLogoClick = (e) => {
    if (easterRef.current) {
      easterRef.current.triggerHit(e);
    }
  };

  return (
    <section style={{
      textAlign: 'center',
      padding: '30px 16px 16px',
      maxWidth: '960px',
      margin: '0 auto',
    }}>
      {/* Hit Circle Easter Egg Controller */}
      <HitCircleEaster ref={easterRef} />

      {/* Prominent OSU Logo + Project Name - Linearly glides towards top header on scroll */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        marginBottom: '14px',
        flexWrap: 'wrap',
        transform: `translate3d(0, ${heroBrandY}px, 0) scale(${heroBrandScale})`,
        opacity: heroBrandOpacity,
        transformOrigin: 'center center',
        willChange: 'transform, opacity',
        transition: 'transform 0.05s linear, opacity 0.05s linear',
      }}>
        <img
          src="/osuLogo.png"
          alt="osu! logo"
          className="osu-btn-interactive"
          onMouseEnter={() => osuAudio.playHover()}
          onClick={handleLogoClick}
          style={{
            width: '64px',
            height: '64px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 0 22px rgba(255, 102, 170, 0.75))',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        />
        <div style={{ textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{
              fontSize: 'clamp(2rem, 4vw, 2.7rem)',
              fontWeight: 900,
              letterSpacing: '-0.02em',
              color: '#ffffff',
              margin: 0,
              lineHeight: 1.1,
            }}>
              osu! <span style={{ color: '#ff66aa', textShadow: '0 0 24px rgba(255, 102, 170, 0.55)' }}>Playlist Sync</span>
            </h1>
            <span style={{
              background: 'rgba(255, 102, 170, 0.15)',
              color: '#ff66aa',
              border: '1px solid rgba(255, 102, 170, 0.35)',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              lazer
            </span>
          </div>
        </div>
      </div>

      {/* Main Tagline */}
      <h2 style={{
        fontSize: 'clamp(1.15rem, 2.2vw, 1.45rem)',
        fontWeight: 800,
        color: '#ffffff',
        marginBottom: '16px',
        letterSpacing: '-0.01em',
      }}>
        Sync your <span style={{ color: '#ff66aa', textShadow: '0 0 16px rgba(255, 102, 170, 0.4)' }}>YouTube Playlists</span> to{' '}
        <span style={{ color: '#3399ff', textShadow: '0 0 16px rgba(51, 153, 255, 0.4)' }}>osu! Beatmaps</span>
      </h2>

      {/* 3 Frosted Glass Step Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        margin: '16px 0 10px',
        textAlign: 'left',
      }}>
        <div
          className="osu-btn-interactive osu-glass-card"
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'rgba(255, 0, 0, 0.2)',
            boxShadow: '0 0 12px rgba(255, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <YouTubeIcon size={18} color="#ff3333" />
          </div>
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#ffffff' }}>1. Paste Playlist</div>
            <div style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 600 }}>Grab any YouTube playlist</div>
          </div>
        </div>

        <div
          className="osu-btn-interactive osu-glass-card"
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'rgba(255, 102, 170, 0.2)',
            boxShadow: '0 0 12px rgba(255, 102, 170, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Search size={16} color="#ff66aa" />
          </div>
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#ffffff' }}>2. Auto Match</div>
            <div style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 600 }}>Finds official beatmaps</div>
          </div>
        </div>

        <div
          className="osu-btn-interactive osu-glass-card"
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
          }}
        >
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'rgba(51, 153, 255, 0.2)',
            boxShadow: '0 0 12px rgba(51, 153, 255, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Download size={16} color="#3399ff" />
          </div>
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#ffffff' }}>3. Download & Play</div>
            <div style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 600 }}>Get .osz files or 1 ZIP</div>
          </div>
        </div>
      </div>
    </section>
  );
}
