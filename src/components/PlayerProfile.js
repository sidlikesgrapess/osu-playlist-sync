'use client';

import { useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function PlayerProfile({ player, onClear }) {
  const [avatarError, setAvatarError] = useState(false);

  if (!player) return null;

  return (
    <div style={{
      maxWidth: '1240px',
      margin: '0 auto 12px',
      borderRadius: '10px',
      overflow: 'hidden',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      background: '#1c1a25',
      position: 'relative',
    }}>
      {/* Cover banner */}
      <div style={{
        position: 'relative',
        minHeight: '104px',
        background: player.coverUrl
          ? `url(${player.coverUrl}) center/cover no-repeat`
          : 'linear-gradient(120deg, #3a2440 0%, #241f2e 100%)',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, rgba(16,14,22,0.92) 0%, rgba(16,14,22,0.72) 45%, rgba(16,14,22,0.5) 100%)',
        }} />

        {/* Avatar + name */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '16px 18px',
          flexWrap: 'wrap',
        }}>
          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '10px',
            overflow: 'hidden',
            flexShrink: 0,
            background: '#2c2234',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
          }}>
            {player.avatarUrl && !avatarError && (
              <img
                src={player.avatarUrl}
                alt={player.username}
                loading="lazy"
                decoding="async"
                width={68}
                height={68}
                onError={() => setAvatarError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{
                fontSize: 'clamp(1.15rem, 4vw, 1.6rem)',
                fontWeight: 900,
                margin: 0,
                color: '#ffffff',
                textShadow: '0 2px 8px rgba(0,0,0,0.6)',
              }}>
                {player.username}
              </h2>
              {player.countryCode && (
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  color: '#c6b8ce',
                  background: 'rgba(0, 0, 0, 0.45)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  padding: '2px 7px',
                  borderRadius: '4px',
                }}>
                  {player.countryCode}
                </span>
              )}
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
              marginTop: '4px',
              fontSize: '0.76rem',
              fontWeight: 700,
              color: '#c6b8ce',
            }}>
              {player.globalRank && <span>#{player.globalRank.toLocaleString()} global</span>}
              {player.pp !== null && player.pp !== undefined && (
                <span style={{ color: '#ff66aa' }}>{player.pp.toLocaleString()}pp</span>
              )}
              <a
                href={`https://osu.ppy.sh/users/${player.id}`}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={() => osuAudio.playHover()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: '#44bbee',
                  textDecoration: 'none',
                }}
              >
                <span>osu! profile</span>
                <ExternalLink size={11} />
              </a>
            </div>
          </div>

          <button
            className="osu-btn-interactive"
            onClick={() => {
              osuAudio.playClick();
              onClear();
            }}
            onMouseEnter={() => osuAudio.playHover()}
            style={{
              background: 'rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: '#c6b8ce',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '0.74rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontFamily: 'inherit',
              minHeight: '34px',
              flexShrink: 0,
            }}
            title="Clear this player"
          >
            <X size={13} />
            <span>Change Player</span>
          </button>
        </div>
      </div>
    </div>
  );
}
