'use client';

import { AlertTriangle } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

/**
 * REBUILD_PLAN.md 2.1 item 5 / 2.4: "a small dialog with an OK button, not an
 * auto-dismissing toast", shown once per fetch (first load or append) whenever the
 * playlist extractor reports `truncated`. `message` is built by the caller from
 * `playlistLength`/`loadedCount` so this component only has to display it.
 *
 * Same overlay and card conventions as ExportModal/SetupGuideModal, sized down for a
 * one-line notice with a single acknowledging action.
 */
export default function TruncationDialog({ isOpen, message, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '12px',
      boxSizing: 'border-box',
    }}>
      <div className="osu-glass" style={{
        maxWidth: '420px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '10px',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7)',
        background: '#1d1b26',
        padding: '18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <AlertTriangle size={18} color="#ffbb22" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 700, color: '#e8e2ee', lineHeight: 1.5 }}>
            {message}
          </p>
        </div>

        <button
          className="osu-btn-interactive osu-btn-pink"
          onClick={() => {
            osuAudio.playClick();
            onClose();
          }}
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            marginTop: '16px',
            alignSelf: 'flex-end',
            border: 'none',
            fontWeight: 800,
            fontSize: '0.78rem',
            padding: '7px 18px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}
