'use client';

import { X, CheckCircle2, Sparkles, Download, Music, Zap, ExternalLink, HelpCircle } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function SetupGuideModal({ isOpen, onClose }) {
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
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#2c2234',
              color: '#ff66aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Sparkles size={18} />
            </div>
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
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00cc77', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.66rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase' }}>osu! Database</div>
                <div style={{ fontSize: '0.78rem', color: '#ffffff', fontWeight: 800 }}>Connected & Live</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3399ff', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.66rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase' }}>Fast OSZ Mirror</div>
                <div style={{ fontSize: '0.78rem', color: '#ffffff', fontWeight: 800 }}>Active (catboy.best)</div>
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

          {/* How It Works Guide */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <HelpCircle size={15} color="#ff66aa" />
              <span>How To Use:</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
              <div className="osu-glass-card" style={{ padding: '10px 14px', borderRadius: '8px', background: '#252130', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ background: '#ff66aa', color: '#ffffff', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, flexShrink: 0 }}>
                  1
                </span>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffffff' }}>Paste Any Music Playlist or Song</div>
                  <div style={{ fontSize: '0.72rem', color: '#c0b4c8', marginTop: '1px', lineHeight: 1.35 }}>
                    Copy URLs from YouTube, Spotify, Apple Music, or search by song name and tap <strong>Find</strong>.
                  </div>
                </div>
              </div>

              <div className="osu-glass-card" style={{ padding: '10px 14px', borderRadius: '8px', background: '#252130', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ background: '#3399ff', color: '#ffffff', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, flexShrink: 0 }}>
                  2
                </span>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffffff' }}>Smart Beatmap Matching & Previews</div>
                  <div style={{ fontSize: '0.72rem', color: '#c0b4c8', marginTop: '1px', lineHeight: 1.35 }}>
                    Matches are checked against osu! beatmaps. Tap play on covers to listen to 10s audio previews.
                  </div>
                </div>
              </div>

              <div className="osu-glass-card" style={{ padding: '10px 14px', borderRadius: '8px', background: '#252130', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ background: '#00cc77', color: '#0b2618', width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900, flexShrink: 0 }}>
                  3
                </span>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#ffffff' }}>1-Click Download & Import</div>
                  <div style={{ fontSize: '0.72rem', color: '#c0b4c8', marginTop: '1px', lineHeight: 1.35 }}>
                    Download single <strong>.OSZ</strong> maps or get everything in one go with <strong>Bundle as .ZIP</strong>.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pro Tip Box */}
          <div style={{
            background: '#281c2c',
            border: '1px solid rgba(255, 102, 170, 0.25)',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Zap size={16} color="#ff66aa" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.74rem', color: '#ffffff', fontWeight: 600, lineHeight: 1.35 }}>
              <strong>Pro-Tip:</strong> Open downloaded <span className="mono-font" style={{ color: '#44bbee' }}>.osz</span> files directly in osu! or osu! lazer to install instantly!
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
