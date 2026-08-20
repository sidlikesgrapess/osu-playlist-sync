'use client';

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { osuAudio } from '@/lib/soundEffects';

/*
 * osu! Hit Circle Easter Egg
 * 
 * Click the logo = tap a hit circle.
 * - Approach circle shrinks inward
 * - Logo pulses with a bright flash
 * - "100" (light green) / "300" (osu! blue) / "FC!" (gold) judgments
 * - Combo fire particles scatter outward
 * - Combo counter increments and resets after timeout
 */

// Synthesized osu! hit sounds
function playHitSound(ctx, type = '300') {
  if (!ctx) return;
  try {
    if (type === '100') {
      // Slightly lower pitched, softer tick for 100
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(720, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(360, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else {
      // Crisp hit circle "don" — pitched higher for FC! / 300
      const baseFreq = type === 'fc' ? 1400 : 1050;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);

      // Layered noise burst for tactile impact
      const bufferSize = ctx.sampleRate * 0.06;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(type === 'fc' ? 0.08 : 0.05, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start();
    }
  } catch (e) { }
}

// Particle spark
function Particle({ x, y, angle, speed, color, delay }) {
  const [pos, setPos] = useState({ x, y, opacity: 1, scale: 1 });
  const startRef = useRef(null);

  useEffect(() => {
    let raf;
    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = (timestamp - startRef.current) / 1000 - delay;
      if (elapsed < 0) {
        raf = requestAnimationFrame(animate);
        return;
      }
      const progress = Math.min(elapsed / 0.65, 1);
      const distance = speed * progress * 80;
      const currentX = x + Math.cos(angle) * distance;
      const currentY = y + Math.sin(angle) * distance + progress * progress * 35; // gentle gravity
      const opacity = Math.max(0, 1 - progress);
      const scale = Math.max(0.2, (1 - progress * 0.7));

      setPos({ x: currentX, y: currentY, opacity, scale });

      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [x, y, angle, speed, delay]);

  return (
    <div style={{
      position: 'fixed',
      left: `${pos.x}px`,
      top: `${pos.y}px`,
      width: '5px',
      height: '5px',
      borderRadius: '50%',
      background: color,
      opacity: pos.opacity,
      transform: `scale(${pos.scale})`,
      pointerEvents: 'none',
      zIndex: 999998,
    }} />
  );
}

// Judgment text popup ("100", "300", "FC!")
function JudgmentPopup({ x, y, text, color, glowColor }) {
  const [state, setState] = useState({ y, opacity: 1, scale: 1.6 });
  const startRef = useRef(null);

  useEffect(() => {
    let raf;
    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = (timestamp - startRef.current) / 1000;
      const progress = Math.min(elapsed / 0.9, 1);

      // Spring-in then float up and fade
      const scaleT = Math.min(elapsed / 0.12, 1);
      const springScale = scaleT < 1 ? 1.6 - 0.6 * scaleT : 1;
      const fadeStart = 0.45;
      const fadeProgress = progress > fadeStart ? (progress - fadeStart) / (1 - fadeStart) : 0;

      setState({
        y: y - progress * 60,
        opacity: 1 - fadeProgress,
        scale: springScale * (1 - fadeProgress * 0.3),
      });
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      left: `${x}px`,
      top: `${state.y}px`,
      transform: `translate(-50%, -50%) scale(${state.scale * 0.7})`,
      opacity: state.opacity,
      color,
      fontSize: text === 'FC!' ? '1.75rem' : '1.5rem',
      fontWeight: 900,
      fontStyle: text === 'FC!' ? 'italic' : 'normal',
      letterSpacing: '0.02em',
      textShadow: '0 2px 6px rgba(0, 0, 0, 0.9)',
      pointerEvents: 'none',
      zIndex: 999999,
      fontFamily: 'inherit',
      userSelect: 'none',
    }}>
      {text}
    </div>
  );
}

// Approach circle ring that shrinks inward
function ApproachCircle({ x, y, size }) {
  const [scale, setScale] = useState(2.8);
  const [opacity, setOpacity] = useState(0.9);
  const startRef = useRef(null);

  useEffect(() => {
    let raf;
    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = (timestamp - startRef.current) / 1000;
      const progress = Math.min(elapsed / 0.35, 1);
      const ease = 1 - Math.pow(1 - progress, 2);
      setScale(2.8 - 1.8 * ease);
      setOpacity(0.9 * (1 - ease));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: `${size}px`,
      height: `${size}px`,
      transform: `translate(-50%, -50%) scale(${scale})`,
      border: '2.5px solid #ffffff',
      borderRadius: '50%',
      opacity,
      pointerEvents: 'none',
      zIndex: 999997,
    }} />
  );
}

// Combo counter badge
function ComboBadge({ x, y, combo }) {
  const [state, setState] = useState({ scale: 1.8, opacity: 1 });
  const startRef = useRef(null);

  useEffect(() => {
    let raf;
    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = (timestamp - startRef.current) / 1000;

      const scaleT = Math.min(elapsed / 0.1, 1);
      const s = 1.8 - 0.8 * scaleT;
      const fadeProgress = elapsed > 1.2 ? Math.min((elapsed - 1.2) / 0.4, 1) : 0;

      setState({
        scale: s * (1 - fadeProgress * 0.2),
        opacity: 1 - fadeProgress,
      });
      if (fadeProgress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      left: `${x}px`,
      top: `${y + 30}px`,
      transform: `translate(-50%, 0) scale(${state.scale})`,
      opacity: state.opacity,
      color: '#ffcc22',
      fontSize: '0.85rem',
      fontWeight: 900,
      textShadow: '0 0 12px rgba(255, 204, 34, 0.7), 0 1px 3px rgba(0,0,0,0.9)',
      pointerEvents: 'none',
      zIndex: 999999,
      fontFamily: 'inherit',
      userSelect: 'none',
    }}>
      {combo}x
    </div>
  );
}

// Flash overlay on the logo
function HitFlash({ x, y, size }) {
  const [opacity, setOpacity] = useState(0.85);
  const startRef = useRef(null);

  useEffect(() => {
    let raf;
    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = (timestamp - startRef.current) / 1000;
      const progress = Math.min(elapsed / 0.25, 1);
      setOpacity(0.85 * (1 - progress));
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      width: `${size}px`,
      height: `${size}px`,
      transform: 'translate(-50%, -50%)',
      borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,102,170,0.4) 50%, transparent 70%)',
      opacity,
      pointerEvents: 'none',
      zIndex: 999996,
    }} />
  );
}

// Main easter egg controller
const HitCircleEaster = forwardRef(function HitCircleEaster(props, ref) {
  const [effects, setEffects] = useState([]);
  const [mounted, setMounted] = useState(false);
  const comboRef = useRef(0);
  const comboTimerRef = useRef(null);
  const lastClickRef = useRef(0);
  const effectIdRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const triggerHit = useCallback((e) => {
    if (!mounted) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const logoSize = rect.width;
    const now = Date.now();
    const timeSinceLast = now - lastClickRef.current;
    lastClickRef.current = now;

    // Determine judgment based on click speed:
    // - FC! for 5+ rapid hits (<350ms)
    // - 300 for regular hits (<600ms or starting tap)
    // - 100 in light green for slower hits
    let judgment, color, glowColor;
    if (comboRef.current >= 5 && timeSinceLast < 350) {
      judgment = 'FC!';
      color = '#ffcc22';
      glowColor = 'rgba(255, 204, 34, 0.85)';
    } else if (timeSinceLast < 600 || comboRef.current === 0) {
      judgment = '300';
      color = '#44bbee';
      glowColor = 'rgba(68, 187, 238, 0.75)';
    } else {
      judgment = '100';
      color = '#66ff99';
      glowColor = 'rgba(102, 255, 153, 0.75)';
    }

    // Increment combo
    comboRef.current += 1;

    // Reset combo after 1.5s of no clicks
    clearTimeout(comboTimerRef.current);
    comboTimerRef.current = setTimeout(() => {
      comboRef.current = 0;
    }, 1500);

    const id = effectIdRef.current++;
    const combo = comboRef.current;

    // Play hit sound
    osuAudio.init();
    const soundType = judgment === '100' ? '100' : judgment === 'FC!' ? 'fc' : '300';
    playHitSound(osuAudio.ctx, soundType);

    // Create particles
    const particleCount = judgment === 'FC!' ? 20 : judgment === '300' ? 14 : 8;
    const particleColors = judgment === 'FC!'
      ? ['#ffcc22', '#ff66aa', '#ffee88', '#ff88bb']
      : judgment === '300'
        ? ['#ff66aa', '#44bbee', '#ff88cc', '#66ccff']
        : ['#66ff99', '#88ffaa', '#44dd88', '#aaffcc'];

    const particles = Array.from({ length: particleCount }, (_, i) => ({
      key: `${id}-p-${i}`,
      angle: (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5,
      speed: 0.6 + Math.random() * 0.8,
      color: particleColors[Math.floor(Math.random() * particleColors.length)],
      delay: Math.random() * 0.04,
    }));

    const newEffect = {
      id,
      cx,
      cy,
      logoSize,
      judgment,
      color,
      glowColor,
      particles,
      combo,
    };

    setEffects(prev => [...prev, newEffect]);

    // Auto-remove effect after animation completes
    setTimeout(() => {
      setEffects(prev => prev.filter(e => e.id !== id));
    }, 1800);
  }, [mounted]);

  // Expose triggerHit to parent via ref
  useImperativeHandle(ref, () => ({
    triggerHit,
  }), [triggerHit]);

  if (!mounted) return null;

  return (
    <>
      {/* Invisible portal to render effects at body root for proper z-indexing */}
      {createPortal(
        <div id="hit-circle-easter-layer" style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 999995 }}>
          {effects.map(effect => (
            <div key={effect.id}>
              {/* Approach circle */}
              <ApproachCircle x={effect.cx} y={effect.cy} size={effect.logoSize} />

              {/* White flash over logo */}
              <HitFlash x={effect.cx} y={effect.cy} size={effect.logoSize * 1.8} />

              {/* Judgment text */}
              <JudgmentPopup
                x={effect.cx}
                y={effect.cy - effect.logoSize * 0.7}
                text={effect.judgment}
                color={effect.color}
                glowColor={effect.glowColor}
              />

              {/* Combo counter */}
              {effect.combo > 1 && (
                <ComboBadge x={effect.cx} y={effect.cy} combo={effect.combo} />
              )}

              {/* Fire particles */}
              {effect.particles.map(p => (
                <Particle
                  key={p.key}
                  x={effect.cx}
                  y={effect.cy}
                  angle={p.angle}
                  speed={p.speed}
                  color={p.color}
                  delay={p.delay}
                />
              ))}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
});

export default HitCircleEaster;
