'use client';

import { useState, useEffect, useRef } from 'react';
import { osuAudio } from '@/lib/soundEffects';
import HitCircleEaster from './HitCircleEaster';

export default function Hero({ onTryDemo }) {
  const [scrollY, setScrollY] = useState(0);
  const easterRef = useRef(null);

  useEffect(() => {
    let lastScroll = -1;
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentY = window.scrollY;
          // Only update state while in active top transition zone (0 to 150px)
          if (currentY <= 150 || lastScroll <= 150) {
            setScrollY(Math.min(150, currentY));
            lastScroll = currentY;
          }
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
      padding: 'clamp(16px, 4vw, 30px) clamp(10px, 3vw, 16px) 12px',
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
        gap: 'clamp(10px, 3vw, 16px)',
        marginBottom: '10px',
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
            width: 'clamp(48px, 12vw, 64px)',
            height: 'clamp(48px, 12vw, 64px)',
            objectFit: 'contain',
            cursor: 'pointer',
            userSelect: 'none',
            flexShrink: 0,
            touchAction: 'manipulation',
          }}
        />
        <div style={{ textAlign: 'left' }}>
          <h1 style={{
            fontSize: 'clamp(1.8rem, 6vw, 2.8rem)',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: '#ffffff',
            margin: 0,
            lineHeight: 1.1,
          }}>
            osu! <span style={{ color: '#ff66aa' }}>Sync</span>
          </h1>
        </div>
      </div>

      {/* Clean Tagline */}
      <h2 style={{
        fontSize: 'clamp(0.92rem, 2.8vw, 1.2rem)',
        fontWeight: 600,
        color: '#c0b4c8',
        margin: '0 auto 6px',
        letterSpacing: '-0.01em',
        lineHeight: 1.45,
        maxWidth: '580px',
      }}>
        Sync your <span style={{ color: '#1db954', fontWeight: 800 }}>Spotify</span>, <span style={{ color: '#ff5555', fontWeight: 800 }}>YouTube</span> &amp; <span style={{ color: '#fc3c44', fontWeight: 800 }}>Apple Music</span> playlists to <span style={{ color: '#ff66aa', fontWeight: 800 }}>osu! Beatmaps</span>
      </h2>
    </section>
  );
}
