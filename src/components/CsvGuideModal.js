'use client';

import { ExternalLink, Upload } from 'lucide-react';
import Modal from './Modal';
import { SpotifyIcon } from './Icons';
import { osuAudio } from '@/lib/soundEffects';

const EXPORTIFY_URL = 'https://exportify.net';

const linkStyle = { color: '#44bbee', fontWeight: 800, textDecoration: 'none' };

const STEPS = [
  <>
    Open{' '}
    <a href={EXPORTIFY_URL} target="_blank" rel="noopener noreferrer" style={linkStyle}>
      exportify.net <ExternalLink size={10} style={{ verticalAlign: 'baseline' }} />
    </a>
    {' '}and click <b>Get Started</b>. Log in with Spotify and allow it to read your playlists.
  </>,
  <>
    Click <b>Export</b> next to a playlist to get its <b>.csv</b> file, or <b>Export All</b> for
    one <b>.zip</b> holding every playlist.
  </>,
  <>
    Come back here, click <b>Upload CSV</b> and choose the file. You can pick several .csv
    files at once, or the .zip as it is, and then tick the playlists you want. Every track
    is matched to osu! beatmaps, just like a pasted playlist.
  </>,
];

const NOTES = [
  'Works for private playlists and your Liked Songs, which a link cannot open.',
  'With songs already in the list, the upload adds to the bottom, like Add More Songs.',
  'A song in more than one playlist is listed once.',
  'Files are read here in your browser and never leave it. Only the song names are searched on osu!.',
];

/** How to make an Exportify CSV of a Spotify playlist, with a button that opens the picker. */
export default function CsvGuideModal({ isOpen, onClose, onUpload }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upload a Spotify CSV"
      subtitle="Export any playlist with Exportify, free and in your browser"
      icon={<SpotifyIcon size={28} color="#1db954" />}
      footer={
        <button
          type="button"
          className="osu-btn-interactive osu-btn-pink"
          onClick={() => {
            osuAudio.playClick();
            onClose();
            onUpload();
          }}
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            padding: '8px 18px',
            borderRadius: '6px',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
            minHeight: '36px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Upload size={14} />
          Upload CSV
        </button>
      }
    >
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {STEPS.map((step, i) => (
          <li key={i} className="osu-glass-card" style={{ borderRadius: '8px', padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{
              flexShrink: 0,
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: 'rgba(255, 102, 170, 0.15)',
              color: '#ff66aa',
              fontSize: '0.74rem',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {i + 1}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#c6b8ce', fontWeight: 600, lineHeight: 1.5 }}>
              {step}
            </span>
          </li>
        ))}
      </ol>

      <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {NOTES.map((note) => (
          <li key={note} style={{ fontSize: '0.72rem', color: '#887c93', fontWeight: 600, lineHeight: 1.5 }}>
            {note}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
