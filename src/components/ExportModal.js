'use client';

import { useState } from 'react';
import { X, Copy, Check, FileText } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

const EXPORT_FORMATS = [
  {
    id: 'links',
    tabLabel: 'Web URLs (.ppy.sh)',
    color: '#ff66aa',
    activeText: '#ffffff',
    line: (s) => `https://osu.ppy.sh/beatmapsets/${s.matchedBeatmap.id} (${s.matchedBeatmap.artist} - ${s.matchedBeatmap.title})`,
  },
  {
    id: 'direct',
    tabLabel: 'osu! Direct (osu://dl)',
    color: '#3399ff',
    activeText: '#ffffff',
    line: (s) => `osu://dl/${s.matchedBeatmap.id}`,
  },
  {
    id: 'text',
    tabLabel: 'Song List (Text)',
    color: '#00dd88',
    activeText: '#0b2230',
    line: (s, idx) => `${idx + 1}. ${s.matchedBeatmap.artist} - ${s.matchedBeatmap.title} [mapped by ${s.matchedBeatmap.creator}] (${s.matchedBeatmap.bpm} BPM, ★ ${s.matchedBeatmap.starRange?.min?.toFixed(1)}-${s.matchedBeatmap.starRange?.max?.toFixed(1)})`,
  },
];

export default function ExportModal({ isOpen, onClose, songs }) {
  const [copiedType, setCopiedType] = useState(null);
  const [exportFormat, setExportFormat] = useState(EXPORT_FORMATS[0].id);

  if (!isOpen) return null;

  const matchedSongs = songs.filter(s => s.matchedBeatmap);
  const format = EXPORT_FORMATS.find(f => f.id === exportFormat) || EXPORT_FORMATS[0];
  const content = matchedSongs.map(format.line).join('\n');

  const handleCopy = () => {
    osuAudio.playClick();
    navigator.clipboard.writeText(content);
    setCopiedType(exportFormat);
    setTimeout(() => setCopiedType(null), 2500);
  };

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
        maxWidth: '680px',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <FileText size={18} color="#ff66aa" style={{ flexShrink: 0 }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 900, margin: 0, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Export Beatmaps ({matchedSongs.length})
            </h3>
          </div>
          <button
            onClick={() => {
              osuAudio.playClick();
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#8b7d95',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Format Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px' }}>
            {EXPORT_FORMATS.map(({ id, tabLabel, color, activeText }) => (
              <button
                key={id}
                onClick={() => {
                  osuAudio.playClick();
                  setExportFormat(id);
                }}
                style={{
                  background: exportFormat === id ? color : 'rgba(255, 255, 255, 0.08)',
                  color: exportFormat === id ? activeText : '#c6b8ce',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '0.76rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  minHeight: '32px',
                }}
              >
                {tabLabel}
              </button>
            ))}
          </div>

          <textarea
            readOnly
            value={content}
            className="mono-font"
            rows={8}
            style={{
              width: '100%',
              background: '#18171c',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#ffffff',
              padding: '10px 12px',
              fontSize: '0.78rem',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#18171c',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={handleCopy}
            className="osu-btn-pink"
            style={{
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontWeight: 800,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'inherit',
              minHeight: '36px',
            }}
          >
            {copiedType ? <Check size={14} /> : <Copy size={14} />}
            <span>{copiedType ? 'Copied!' : 'Copy to Clipboard'}</span>
          </button>

          <button
            onClick={() => {
              osuAudio.playClick();
              onClose();
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#c6b8ce',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
              minHeight: '36px',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
