'use client';

import { useState } from 'react';
import { X, Copy, Check, FileText, Link2, ExternalLink } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function ExportModal({ isOpen, onClose, songs }) {
  const [copiedType, setCopiedType] = useState(null);
  const [exportFormat, setExportFormat] = useState('links'); // 'links' | 'direct' | 'text'

  if (!isOpen) return null;

  const matchedSongs = songs.filter(s => s.matchedBeatmap);

  const generateContent = () => {
    if (exportFormat === 'links') {
      return matchedSongs
        .map(s => `https://osu.ppy.sh/beatmapsets/${s.matchedBeatmap.id} (${s.matchedBeatmap.artist} - ${s.matchedBeatmap.title})`)
        .join('\n');
    }
    if (exportFormat === 'direct') {
      return matchedSongs
        .map(s => `osu://dl/${s.matchedBeatmap.id}`)
        .join('\n');
    }
    if (exportFormat === 'text') {
      return matchedSongs
        .map((s, idx) => `${idx + 1}. ${s.matchedBeatmap.artist} - ${s.matchedBeatmap.title} [mapped by ${s.matchedBeatmap.creator}] (${s.matchedBeatmap.bpm} BPM, ★ ${s.matchedBeatmap.starRange?.min?.toFixed(1)}-${s.matchedBeatmap.starRange?.max?.toFixed(1)})`)
        .join('\n');
    }
    return '';
  };

  const content = generateContent();

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
        maxWidth: '680px',
        width: '100%',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '2px solid rgba(255, 102, 170, 0.6)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={20} color="#ff66aa" />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, color: '#ffffff' }}>
              Export Matched Beatmaps ({matchedSongs.length})
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
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Format Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
            <button
              onClick={() => {
                osuAudio.playClick();
                setExportFormat('links');
              }}
              style={{
                background: exportFormat === 'links' ? '#ff66aa' : '#3c384a',
                color: exportFormat === 'links' ? '#ffffff' : '#c6b8ce',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Web URLs (.ppy.sh)
            </button>
            <button
              onClick={() => {
                osuAudio.playClick();
                setExportFormat('direct');
              }}
              style={{
                background: exportFormat === 'direct' ? '#3399ff' : '#3c384a',
                color: exportFormat === 'direct' ? '#ffffff' : '#c6b8ce',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              osu! Direct (osu://dl)
            </button>
            <button
              onClick={() => {
                osuAudio.playClick();
                setExportFormat('text');
              }}
              style={{
                background: exportFormat === 'text' ? '#00dd88' : '#3c384a',
                color: exportFormat === 'text' ? '#0b2230' : '#c6b8ce',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Song List (Text)
            </button>
          </div>

          <textarea
            readOnly
            value={content}
            className="mono-font"
            rows={10}
            style={{
              width: '100%',
              background: '#18171c',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#ffffff',
              padding: '12px 14px',
              fontSize: '0.82rem',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.6,
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: '#18171c',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <button
            onClick={handleCopy}
            style={{
              background: '#ff66aa',
              color: '#ffffff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '6px',
              fontWeight: 800,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'inherit',
            }}
          >
            {copiedType ? <Check size={14} /> : <Copy size={14} />}
            <span>{copiedType ? 'Copied to Clipboard!' : 'Copy to Clipboard'}</span>
          </button>

          <button
            onClick={() => {
              osuAudio.playClick();
              onClose();
            }}
            style={{
              background: '#3c384a',
              color: '#c6b8ce',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
