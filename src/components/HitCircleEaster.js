'use client';

import { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useRef } from 'react';
import { createPortal } from 'react-dom';
import { osuAudio } from '@/lib/soundEffects';

/*
 * Minimal & Snappy osu! Logo Tap Easter Egg
 * Clean expanding hit ring + quick subtle "300" judgment.
 */

const HitCircleEaster = forwardRef(function HitCircleEaster(props, ref) {
  const [hits, setHits] = useState([]);
  const [mounted, setMounted] = useState(false);
  const nextId = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const triggerHit = useCallback((e) => {
    if (!mounted) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const size = Math.max(36, rect.width);

    // Play click sound if SFX is turned on
    osuAudio.playClick();

    const id = nextId.current++;
    setHits(prev => [...prev.slice(-3), { id, cx, cy, size }]);

    setTimeout(() => {
      setHits(prev => prev.filter(h => h.id !== id));
    }, 600);
  }, [mounted]);

  useImperativeHandle(ref, () => ({
    triggerHit,
  }), [triggerHit]);

  if (!mounted || hits.length === 0) return null;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99999 }}>
      {hits.map(hit => (
        <div key={hit.id}>
          {/* Simple expanding ring */}
          <div
            style={{
              position: 'fixed',
              left: `${hit.cx}px`,
              top: `${hit.cy}px`,
              width: `${hit.size}px`,
              height: `${hit.size}px`,
              borderRadius: '50%',
              border: '2px solid #ff66aa',
              transform: 'translate(-50%, -50%)',
              animation: 'osu-simple-ripple 0.45s ease-out forwards',
            }}
          />

          {/* Simple "300" popup */}
          <div
            style={{
              position: 'fixed',
              left: `${hit.cx}px`,
              top: `${hit.cy - hit.size * 0.6}px`,
              transform: 'translate(-50%, -50%)',
              color: '#44bbee',
              fontSize: '1.05rem',
              fontWeight: 900,
              fontFamily: 'inherit',
              animation: 'osu-simple-judgment 0.5s ease-out forwards',
              userSelect: 'none',
            }}
          >
            300
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
});

export default HitCircleEaster;
