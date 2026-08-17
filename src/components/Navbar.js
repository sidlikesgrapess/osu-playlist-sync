'use client';

import { Settings2, Volume2, VolumeX } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { osuAudio } from '@/lib/soundEffects';
import HitCircleEaster from './HitCircleEaster';

export default function Navbar({ onOpenSetupGuide, systemStatus }) {
  const [soundOn, setSoundOn] = useState(true);
  const [scrollY, setScrollY] = useState(0);
  const easterRef = useRef(null);

  useEffect(() => {
    let lastScroll = -1;
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentY = window.scrollY;
          // Only update state while in active transition zone (0 to 140px)
          if (currentY <= 140 || lastScroll <= 140) {
            setScrollY(Math.min(140, currentY));
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

  // Linear interpolation: brand seamlessly glides into header between scrollY 20px -> 120px
  const brandProgress = Math.min(1, Math.max(0, (scrollY - 15) / 105));
  const brandOpacity = brandProgress;
  const brandTranslate = (1 - brandProgress) * 14;

  const toggleSound = () => {
    const nextState = !soundOn;
    setSoundOn(nextState);
    osuAudio.enabled = nextState;
    if (nextState) osuAudio.playClick();
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogoClick = (e) => {
    e.stopPropagation();
    if (easterRef.current) {
      easterRef.current.triggerHit(e);
    }
  };

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 60,
      background: `rgba(18, 16, 24, ${0.4 + brandProgress * 0.48})`,
      backdropFilter: 'blur(20px) saturate(160%)',
      WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      borderBottom: `1px solid rgba(255, 102, 170, ${0.06 + brandProgress * 0.24})`,
      boxShadow: brandProgress > 0.1 ? `0 8px 32px rgba(0, 0, 0, ${brandProgress * 0.6}), 0 0 20px rgba(255, 102, 170, ${brandProgress * 0.15})` : 'none',
      padding: '8px 14px',
      transition: 'background 0.08s linear, border 0.08s linear, box-shadow 0.08s linear',
    }}>
      {/* Hit Circle Easter Egg for Navbar logo */}
      <HitCircleEaster ref={easterRef} />

      <div style={{
        maxWidth: '1240px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'nowrap',
        gap: '8px',
        minHeight: '38px',
      }}>
        {/* Dynamic Brand Logo & Name - Linearly glides into place on scroll */}
        <div
          onClick={scrollToTop}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: brandOpacity,
            transform: `translate3d(0, ${brandTranslate}px, 0)`,
            pointerEvents: brandOpacity > 0.5 ? 'auto' : 'none',
            cursor: 'pointer',
            willChange: 'transform, opacity',
            transition: 'transform 0.05s linear, opacity 0.05s linear',
            minWidth: 0,
            overflow: 'hidden',
          }}
          title="Scroll to top"
        >
          <img
            src="/osuLogo.png"
            alt="osu! logo"
            className="osu-btn-interactive"
            onMouseEnter={() => osuAudio.playHover()}
            onClick={handleLogoClick}
            style={{
              width: '30px',
              height: '30px',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 12px rgba(255, 102, 170, 0.65))',
              userSelect: 'none',
              flexShrink: 0,
              touchAction: 'manipulation',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
              osu! <span style={{ color: '#ff66aa' }}>Playlist Sync</span>
            </span>
            <span style={{
              background: 'rgba(255, 102, 170, 0.15)',
              color: '#ff66aa',
              border: '1px solid rgba(255, 102, 170, 0.3)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontSize: '0.62rem',
              fontWeight: 800,
              textTransform: 'uppercase',
            }}>
              lazer
            </span>
          </div>
        </div>

        {/* Right action buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', flexShrink: 0 }}>
          {/* Sound Effect Toggle */}
          <button
            className="osu-btn-interactive"
            onClick={toggleSound}
            onMouseEnter={() => osuAudio.playHover()}
            style={{
              background: soundOn ? 'rgba(255, 102, 170, 0.15)' : 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${soundOn ? 'rgba(255, 102, 170, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
              color: soundOn ? '#ff66aa' : '#8b7d95',
              padding: '6px 9px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'inherit',
              minHeight: '34px',
            }}
            title={soundOn ? 'Sound Effects Enabled' : 'Sound Effects Muted'}
          >
            {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>SFX</span>
          </button>

          {/* Info & Guide / System Status Button */}
          <button
            className="osu-btn-interactive"
            onClick={() => {
              osuAudio.playClick();
              onOpenSetupGuide();
            }}
            onMouseEnter={() => osuAudio.playHover()}
            style={{
              background: 'rgba(0, 221, 136, 0.15)',
              border: '1px solid rgba(0, 221, 136, 0.35)',
              color: '#00dd88',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              fontFamily: 'inherit',
              minHeight: '34px',
            }}
            title="View guide and system status"
          >
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00dd88', boxShadow: '0 0 8px #00dd88', flexShrink: 0 }} />
            <span>Guide</span>
          </button>
        </div>
      </div>
    </header>
  );
}
