'use client';

import { X, CheckCircle2, Sparkles, Download, Music, Zap, ExternalLink, HelpCircle } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function SetupGuideModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(10, 8, 14, 0.75)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px',
    }}>
      <div className="osu-glass" style={{
        maxWidth: '700px',
        width: '100%',
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '2px solid rgba(255, 102, 170, 0.5)',
        borderRadius: '12px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 102, 170, 0.25)',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(18, 16, 24, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'rgba(255, 102, 170, 0.18)',
              color: '#ff66aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(255, 102, 170, 0.3)',
            }}>
              <Sparkles size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0, color: '#ffffff' }}>
                osu! Playlist Sync
              </h2>
              <p style={{ fontSize: '0.78rem', color: '#8b7d95', margin: '2px 0 0', fontWeight: 600 }}>
                Instant YouTube playlist converter for osu! (stable & lazer)
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
              color: '#8b7d95',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Live Status Indicators */}
          <div className="osu-glass-card" style={{
            padding: '14px 18px',
            borderRadius: '10px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#00dd88', boxShadow: '0 0 10px #00dd88' }} />
              <div>
                <div style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 800, textTransform: 'uppercase' }}>osu! Database</div>
                <div style={{ fontSize: '0.84rem', color: '#ffffff', fontWeight: 800 }}>Connected & Live</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3399ff', boxShadow: '0 0 10px #3399ff' }} />
              <div>
                <div style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 800, textTransform: 'uppercase' }}>Fast OSZ Mirror</div>
                <div style={{ fontSize: '0.84rem', color: '#ffffff', fontWeight: 800 }}>Active (catboy.best)</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ff66aa', boxShadow: '0 0 10px #ff66aa' }} />
              <div>
                <div style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 800, textTransform: 'uppercase' }}>Game Modes</div>
                <div style={{ fontSize: '0.84rem', color: '#ffffff', fontWeight: 800 }}>All 4 Modes Supported</div>
              </div>
            </div>
          </div>

          {/* How It Works Guide */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <HelpCircle size={16} color="#ff66aa" />
              <span>How To Use:</span>
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <div className="osu-glass-card" style={{ padding: '12px 16px', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ background: '#ff66aa', color: '#ffffff', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', fontWeight: 900, flexShrink: 0 }}>
                  1
                </span>
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#ffffff' }}>Paste Any YouTube Music Playlist</div>
                  <div style={{ fontSize: '0.76rem', color: '#c6b8ce', marginTop: '2px', lineHeight: 1.4 }}>
                    Copy the URL of your favorite playlist or music mix from YouTube and click <strong>Find Beatmaps</strong>.
                  </div>
                </div>
              </div>

              <div className="osu-glass-card" style={{ padding: '12px 16px', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ background: '#3399ff', color: '#ffffff', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', fontWeight: 900, flexShrink: 0 }}>
                  2
                </span>
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#ffffff' }}>Smart Beatmap Matching & Audio Previews</div>
                  <div style={{ fontSize: '0.76rem', color: '#c6b8ce', marginTop: '2px', lineHeight: 1.4 }}>
                    Songs are matched with difficulty stars, BPM, and creator credits. Click the audio play button on any cover to listen to a 10s preview.
                  </div>
                </div>
              </div>

              <div className="osu-glass-card" style={{ padding: '12px 16px', borderRadius: '8px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ background: '#00dd88', color: '#000000', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.74rem', fontWeight: 900, flexShrink: 0 }}>
                  3
                </span>
                <div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#ffffff' }}>1-Click Download & In-Game Import</div>
                  <div style={{ fontSize: '0.76rem', color: '#c6b8ce', marginTop: '2px', lineHeight: 1.4 }}>
                    Download individual maps via <strong>.OSZ</strong> or download everything in one archive via <strong>Bundle as .ZIP</strong>.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pro Tip Box */}
          <div style={{
            background: 'rgba(255, 102, 170, 0.1)',
            border: '1px solid rgba(255, 102, 170, 0.3)',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <Zap size={18} color="#ff66aa" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '0.78rem', color: '#ffffff', fontWeight: 600, lineHeight: 1.4 }}>
              <strong>Pro-Tip for osu! players:</strong> You can drag-and-drop downloaded <span className="mono-font" style={{ color: '#44bbee' }}>.osz</span> files directly into your running osu! window or press <kbd style={{ background: '#343040', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>Enter</kbd> to install instantly!
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(18, 16, 24, 0.85)',
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
              fontSize: '0.84rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
}
