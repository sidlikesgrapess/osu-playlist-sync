'use client';

import { X, Rocket } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

const WHATS_NEW = [
  {
    title: 'Add More Songs',
    description: 'Paste more links without losing your current list.',
  },
  {
    title: 'Search All button',
    description: 'One click to search everything still unmatched.',
  },
  {
    title: 'Smarter query cleanup',
    description: "Cleans up mods and junk from titles before searching.",
  },
];

export default function SetupGuideModal({ isOpen, onClose, systemStatus }) {
  if (!isOpen) return null;

  const osuConfigured = systemStatus?.osuConfigured ?? true;
  const mirrorName = systemStatus?.defaultMirror || 'catboy.best';

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
        maxWidth: '700px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '10px',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7)',
        background: '#1d1b26',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#171520',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <img
              src="/osuLogo.png"
              alt="osu! logo"
              style={{
                width: '32px',
                height: '32px',
                objectFit: 'contain',
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 900, margin: 0, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                osu! Sync
              </h2>
              <p style={{ fontSize: '0.72rem', color: '#887c93', margin: '1px 0 0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Multi-platform playlist converter for osu!
              </p>
            </div>
          </div>
          <button
            className="osu-btn-interactive"
            onClick={() => {
              osuAudio.playClick();
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#887c93',
              cursor: 'pointer',
              padding: '4px',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          {/* Live Status Indicators */}
          <div className="osu-glass-card" style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: '#252130',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: osuConfigured ? '#00cc77' : '#ff4444', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.66rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase' }}>osu! Database</div>
                <div style={{ fontSize: '0.78rem', color: '#ffffff', fontWeight: 800 }}>{osuConfigured ? 'Connected & Live' : 'Not Configured'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3399ff', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.66rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase' }}>Fast OSZ Mirror</div>
                <div style={{ fontSize: '0.78rem', color: '#ffffff', fontWeight: 800 }}>Active ({mirrorName})</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff66aa', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.66rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase' }}>Game Modes</div>
                <div style={{ fontSize: '0.78rem', color: '#ffffff', fontWeight: 800 }}>All 4 Supported</div>
              </div>
            </div>
          </div>

          {/* What's New */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <Rocket size={15} color="#ff66aa" />
              <span>What's New</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
              {WHATS_NEW.map((item) => (
                <div key={item.title} className="osu-glass-card" style={{ padding: '10px 14px', borderRadius: '8px', background: '#252130', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <span style={{ background: '#ff66aa', width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, marginTop: '7px' }} />
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffffff' }}>{item.title}</div>
                    <div style={{ fontSize: '0.72rem', color: '#c0b4c8', marginTop: '1px', lineHeight: 1.35 }}>
                      {item.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#171520',
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <button
            className="osu-btn-interactive osu-btn-pink"
            onClick={() => {
              osuAudio.playClick();
              onClose();
            }}
            style={{
              border: 'none',
              padding: '8px 20px',
              borderRadius: '6px',
              fontWeight: 800,
              fontSize: '0.82rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
              minHeight: '36px',
            }}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
