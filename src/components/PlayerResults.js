'use client';

import { ChevronRight, ChevronLeft } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

const RESULTS_PER_PAGE = 20;

export default function PlayerResults({ users, total, page = 1, onPageChange, onSelect, isLoading }) {
  if (!users || users.length === 0) return null;

  const totalFound = Math.max(total || 0, users.length);
  const totalPages = Math.max(1, Math.ceil(totalFound / RESULTS_PER_PAGE));
  const rangeStart = (page - 1) * RESULTS_PER_PAGE + 1;
  const rangeEnd = rangeStart + users.length - 1;

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto 16px' }}>
      <div style={{
        fontSize: '0.72rem',
        color: '#887c93',
        fontWeight: 800,
        textTransform: 'uppercase',
        marginBottom: '8px',
      }}>
        {totalFound.toLocaleString()} player{totalFound === 1 ? '' : 's'} found
        {totalPages > 1 && `, showing ${rangeStart} to ${rangeEnd}`}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '8px',
      }}>
        {users.map((user) => (
          <button
            key={user.id}
            className="osu-btn-interactive osu-glass-card"
            onClick={() => {
              osuAudio.playClick();
              onSelect(user);
            }}
            onMouseEnter={() => osuAudio.playHover()}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: '#252130',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              cursor: isLoading ? 'wait' : 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            <img
              src={user.avatarUrl}
              alt={user.username}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                objectFit: 'cover',
                flexShrink: 0,
                background: '#2c2234',
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: '0.86rem',
                fontWeight: 800,
                color: '#ffffff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {user.username}
              </div>
              {user.countryCode && (
                <div style={{ fontSize: '0.7rem', color: '#887c93', fontWeight: 700 }}>
                  {user.countryCode}
                </div>
              )}
            </div>
            <ChevronRight size={14} color="#887c93" style={{ flexShrink: 0 }} />
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          marginTop: '12px',
        }}>
          <button
            className="osu-btn-interactive"
            onClick={() => {
              osuAudio.playClick();
              onPageChange(page - 1);
            }}
            disabled={isLoading || page <= 1}
            style={{
              background: '#262232',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: page <= 1 ? '#554d60' : '#c0b4c8',
              borderRadius: '5px',
              padding: '4px 8px',
              cursor: isLoading || page <= 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'inherit',
            }}
          >
            <ChevronLeft size={14} />
          </button>

          <span style={{ fontSize: '0.76rem', color: '#c0b4c8', fontWeight: 700 }}>
            Page {page} of {totalPages.toLocaleString()}
          </span>

          <button
            className="osu-btn-interactive"
            onClick={() => {
              osuAudio.playClick();
              onPageChange(page + 1);
            }}
            disabled={isLoading || page >= totalPages}
            style={{
              background: '#262232',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: page >= totalPages ? '#554d60' : '#c0b4c8',
              borderRadius: '5px',
              padding: '4px 8px',
              cursor: isLoading || page >= totalPages ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              fontFamily: 'inherit',
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
