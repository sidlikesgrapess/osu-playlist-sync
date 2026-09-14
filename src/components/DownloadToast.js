'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

const AUTO_DISMISS_MS = 5000;
const SLIDE_MS = 420;

const FOLLOW = 0.22;         // damped pull toward the cursor
const VEL_SMOOTHING = 0.35;  // EMA weight, so one jittery frame can't launch it
const GRAVITY = 0.8;         // px per frame^2 (~9.8m/s^2 at this scale)
const AIR_DRAG = 0.995;
const TERMINAL_VY = 30;
const MAX_RELEASE_SPEED = 26;
const RELEASE_BOOST = 1.25;  // compensates for the card trailing the cursor
const FADE_PER_FRAME = 0.035;

const OFFSCREEN = 'translate3d(calc(100% + 28px), 0, 0)';

function ToastCard({ toast, onDismiss }) {
  const nodeRef = useRef(null);
  const rafRef = useRef(null);
  const autoTimerRef = useRef(null);
  const leaveTimerRef = useRef(null);

  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [physicsOn, setPhysicsOn] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  // Animation values live in refs so the RAF loop can drive the DOM directly.
  const phys = useRef({ x: 0, y: 0, vx: 0, vy: 0, opacity: 1, mode: 'idle' });
  const drag = useRef({ active: false, px: 0, py: 0, gx: 0, gy: 0 });

  const clearTimers = () => {
    clearTimeout(autoTimerRef.current);
    clearTimeout(leaveTimerRef.current);
  };

  // Slide in on mount, then arm the auto-dismiss.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    autoTimerRef.current = setTimeout(() => setLeaving(true), AUTO_DISMISS_MS);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(rafRef.current);
      clearTimers();
    };
  }, []);

  // Slide out, then drop it from the stack.
  useEffect(() => {
    if (!leaving) return;
    leaveTimerRef.current = setTimeout(() => onDismiss(toast.id), SLIDE_MS);
    return () => clearTimeout(leaveTimerRef.current);
  }, [leaving, onDismiss, toast.id]);

  const apply = () => {
    const el = nodeRef.current;
    if (!el) return;
    const p = phys.current;
    el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    el.style.opacity = String(Math.max(0, p.opacity));
  };

  const step = () => {
    const p = phys.current;

    if (p.mode === 'drag') {
      // Trail the cursor instead of locking to it.
      const targetX = drag.current.px - drag.current.gx;
      const targetY = drag.current.py - drag.current.gy;
      const nx = p.x + (targetX - p.x) * FOLLOW;
      const ny = p.y + (targetY - p.y) * FOLLOW;

      // Smooth the velocity estimate so the throw uses real motion, not one frame's jitter.
      p.vx += ((nx - p.x) - p.vx) * VEL_SMOOTHING;
      p.vy += ((ny - p.y) - p.vy) * VEL_SMOOTHING;
      p.x = nx;
      p.y = ny;

      apply();
      rafRef.current = requestAnimationFrame(step);
      return;
    }

    if (p.mode === 'fall') {
      // Projectile motion: gravity accelerates downward, light air drag bleeds
      // off sideways speed, terminal velocity keeps the drop from running away.
      p.vy = Math.min(p.vy + GRAVITY, TERMINAL_VY);
      p.vx *= AIR_DRAG;
      p.x += p.vx;
      p.y += p.vy;
      p.opacity -= FADE_PER_FRAME;
      apply();

      const goneOffscreen = Math.abs(p.x) > window.innerWidth || p.y > window.innerHeight;
      if (p.opacity <= 0 || goneOffscreen) {
        cancelAnimationFrame(rafRef.current);
        onDismiss(toast.id);
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    }
  };

  const handlePointerDown = (e) => {
    clearTimers();
    setLeaving(false);
    setGrabbing(true);
    setPhysicsOn(true);

    e.currentTarget.setPointerCapture?.(e.pointerId);

    const p = phys.current;
    p.mode = 'drag';
    drag.current = {
      active: true,
      px: e.clientX,
      py: e.clientY,
      gx: e.clientX - p.x,
      gy: e.clientY - p.y,
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  };

  const handlePointerMove = (e) => {
    if (!drag.current.active) return;
    drag.current.px = e.clientX;
    drag.current.py = e.clientY;
  };

  const handlePointerUp = () => {
    if (!drag.current.active) return;
    drag.current.active = false;
    setGrabbing(false);

    // Carry the drag velocity into the throw, capped so a fast flick can't launch it.
    const p = phys.current;
    const clamp = (v) => Math.max(-MAX_RELEASE_SPEED, Math.min(MAX_RELEASE_SPEED, v * RELEASE_BOOST));
    p.vx = clamp(p.vx);
    p.vy = clamp(p.vy);
    p.mode = 'fall';
  };

  const restingTransform = leaving || !entered ? OFFSCREEN : 'translate3d(0, 0, 0)';

  return (
    <div
      ref={nodeRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        pointerEvents: 'auto',
        touchAction: 'none',
        cursor: grabbing ? 'grabbing' : 'grab',
        userSelect: 'none',
        width: '288px',
        maxWidth: 'calc(100vw - 32px)',
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: '12px 14px',
        borderRadius: '10px',
        background: '#1e1c26',
        border: '1px solid rgba(255, 102, 170, 0.32)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
        // RAF owns the transform once physics kicks in.
        transform: physicsOn ? undefined : restingTransform,
        opacity: physicsOn ? undefined : entered && !leaving ? 1 : 0,
        transition: physicsOn
          ? 'none'
          : `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${SLIDE_MS}ms ease`,
        willChange: 'transform, opacity',
      }}
    >
      <div style={{
        width: '30px',
        height: '30px',
        borderRadius: '8px',
        background: 'rgba(0, 204, 119, 0.14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <CheckCircle2 size={17} color="#00cc77" />
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '0.84rem', fontWeight: 900, color: '#ffffff' }}>
          {toast.title}
        </div>
        {toast.detail && (
          <div style={{
            fontSize: '0.72rem',
            color: '#c0b4c8',
            fontWeight: 600,
            marginTop: '1px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {toast.detail}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DownloadToast({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '70px',
      right: '16px',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
