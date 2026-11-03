'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import OsuCheckbox from './OsuCheckbox';
import { SpotifyIcon } from './Icons';
import { osuAudio } from '@/lib/soundEffects';

const songCount = (n) => `${n} song${n === 1 ? '' : 's'}`;

/**
 * Shown when an upload read more than one playlist (several CSVs, or an Export All .zip), or
 * read some files and not others. Every playlist starts ticked; the ticked ones load as one
 * batch. Files that could not be read are listed with the reason. Mounted once per upload,
 * so the ticks start fresh each time.
 */
export default function CsvChooserModal({ playlists, failures, isAppending, onClose, onLoad }) {
  const [picked, setPicked] = useState(() => new Set(playlists.map((_, i) => i)));

  const toggle = (i) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  const allPicked = picked.size === playlists.length;
  const total = playlists.reduce((sum, p, i) => sum + (picked.has(i) ? p.songs.length : 0), 0);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Choose playlists"
      subtitle={isAppending
        ? 'Added to the bottom of your list. A song already there, or in two playlists, appears once.'
        : 'A song in more than one playlist appears once.'}
      icon={<SpotifyIcon size={28} color="#1db954" />}
      footer={
        <button
          type="button"
          disabled={picked.size === 0}
          className="osu-btn-interactive osu-btn-pink"
          onClick={() => {
            osuAudio.playClick();
            onLoad(playlists.filter((_, i) => picked.has(i)));
          }}
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            padding: '8px 18px',
            borderRadius: '6px',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: picked.size === 0 ? 'not-allowed' : 'pointer',
            opacity: picked.size === 0 ? 0.6 : 1,
            fontFamily: 'inherit',
            minHeight: '36px',
          }}
        >
          {picked.size === 0 ? 'Pick a playlist' : `Load ${songCount(total)}`}
        </button>
      }
    >
      {playlists.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 12px' }}>
            <OsuCheckbox
              checked={allPicked}
              indeterminate={picked.size > 0 && !allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(playlists.map((_, i) => i)))}
              title={allPicked ? 'Untick every playlist' : 'Tick every playlist'}
            />
            <span style={{ fontSize: '0.66rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase' }}>
              {picked.size} of {playlists.length} playlists
            </span>
          </div>

          {playlists.map((playlist, i) => (
            <div
              key={i}
              className="osu-glass-card"
              onClick={() => {
                osuAudio.playClick();
                toggle(i);
              }}
              style={{ borderRadius: '8px', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            >
              <OsuCheckbox checked={picked.has(i)} onChange={() => toggle(i)} />
              <span style={{ flex: 1, minWidth: 0, fontSize: '0.84rem', fontWeight: 800, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {playlist.playlistTitle}
              </span>
              <span style={{ flexShrink: 0, fontSize: '0.72rem', fontWeight: 600, color: '#c6b8ce' }}>
                {songCount(playlist.songs.length)}
              </span>
            </div>
          ))}
        </div>
      )}

      {failures.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.66rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase' }}>
            <AlertTriangle size={12} color="#ffbb22" />
            Could not read {failures.length === 1 ? '1 file' : `${failures.length} files`}
          </div>
          {failures.map(({ name, error }, i) => (
            <div key={i} style={{ fontSize: '0.72rem', color: '#c6b8ce', fontWeight: 600, lineHeight: 1.5, paddingLeft: '18px' }}>
              <b style={{ color: '#ffffff' }}>{name}</b>: {error}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
