'use client';

import { useEffect, useState } from 'react';
import { X, Rocket, ExternalLink } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

const COMMIT_TYPES = {
  feat: { label: 'Feature', color: '#00cc77' },
  fix: { label: 'Fix', color: '#44bbee' },
  perf: { label: 'Performance', color: '#ffbb22' },
  style: { label: 'Style', color: '#ff66aa' },
  refactor: { label: 'Refactor', color: '#9944ff' },
  chore: { label: 'Chore', color: '#887c93' },
  docs: { label: 'Docs', color: '#c0b4c8' },
  test: { label: 'Test', color: '#ff9944' },
  build: { label: 'Build', color: '#887c93' },
  ci: { label: 'CI', color: '#887c93' },
};

const DEFAULT_TYPE = { label: 'Update', color: '#c0b4c8' };

function relativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days > 0) return `${days}d ago`;
  const hours = Math.floor(diffMs / 3600000);
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  return `${mins}m ago`;
}

export default function SetupGuideModal({ isOpen, onClose, systemStatus }) {
  const [commits, setCommits] = useState([]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    // The response carries no Cache-Control, so without this the browser is free to
    // reuse a heuristically cached copy and show an old changelog on every open.
    fetch('/api/github/commits', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (!cancelled) setCommits(data.commits || []);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [isOpen]);

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
                osu!Sync
              </h2>
              <p style={{ fontSize: '0.72rem', color: '#887c93', margin: '1px 0 0', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Playlists, songs and players into osu! beatmaps
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

          {/* Changelog — pulled straight from the repo's latest commits */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <Rocket size={15} color="#ff66aa" />
              <span>Changelog</span>
            </h3>

            {commits.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: '#887c93', fontWeight: 600, padding: '6px 2px' }}>
                Loading latest changes...
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                {commits.map((commit) => {
                  const commitType = COMMIT_TYPES[commit.type] || DEFAULT_TYPE;
                  return (
                  <a
                    key={commit.sha}
                    href={commit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="osu-btn-interactive"
                    onMouseEnter={() => osuAudio.playHover()}
                    style={{
                      padding: '9px 14px',
                      borderRadius: '8px',
                      background: '#252130',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                      display: 'flex',
                      gap: '9px',
                      alignItems: 'center',
                      textDecoration: 'none',
                    }}
                  >
                    <span style={{
                      fontSize: '0.64rem',
                      fontWeight: 900,
                      padding: '2px 7px',
                      borderRadius: '4px',
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      color: commitType.color,
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: `1px solid ${commitType.color}44`,
                    }}>
                      {commitType.label}
                    </span>

                    <span style={{
                      fontSize: '0.75rem',
                      color: '#e4dced',
                      fontWeight: 600,
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {commit.text}
                    </span>

                    <span style={{ fontSize: '0.68rem', color: '#887c93', fontWeight: 700, flexShrink: 0 }}>
                      {relativeTime(commit.date)}
                    </span>
                    <ExternalLink size={11} color="#887c93" style={{ flexShrink: 0 }} />
                  </a>
                  );
                })}
              </div>
            )}
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
