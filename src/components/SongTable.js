'use client';

import { useState, useRef, useEffect } from 'react';
import SongRow from './SongRow';
import { X, Check, Search } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function SongTable({
  songs,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onDownloadSingle,
  downloadingIds,
  onSelectAlternativeMatch,
  onManualSearch,
}) {
  const [activeAudio, setActiveAudio] = useState(null);
  const [altPickerSong, setAltPickerSong] = useState(null);
  const [filterText, setFilterText] = useState('');
  const audioRef = useRef(null);

  // Handle audio play/pause
  const handleToggleAudio = (songId, previewUrl) => {
    if (activeAudio === songId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setActiveAudio(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(previewUrl);
      audioRef.current.volume = 0.5;
      audioRef.current.play().catch(e => {
        console.warn('Audio play prevented or unavailable:', e);
        setActiveAudio(null);
      });
      audioRef.current.onended = () => setActiveAudio(null);
      setActiveAudio(songId);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const matchedSongs = songs.filter(s => s.matchedBeatmap);
  const allSelected = matchedSongs.length > 0 && matchedSongs.every(s => selectedIds.has(s.id));
  const isIndeterminate = matchedSongs.some(s => selectedIds.has(s.id)) && !allSelected;

  const filteredSongs = filterText.trim()
    ? songs.filter(s =>
        s.title.toLowerCase().includes(filterText.toLowerCase()) ||
        (s.matchedBeatmap && (
          s.matchedBeatmap.title.toLowerCase().includes(filterText.toLowerCase()) ||
          s.matchedBeatmap.artist.toLowerCase().includes(filterText.toLowerCase()) ||
          s.matchedBeatmap.creator.toLowerCase().includes(filterText.toLowerCase())
        ))
      )
    : songs;

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto 40px' }}>
      {/* Table toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        marginBottom: '10px',
        padding: '0 2px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            className="osu-btn-interactive osu-glass-card"
            onClick={() => {
              osuAudio.playClick();
              if (allSelected) onDeselectAll();
              else onSelectAll();
            }}
            style={{
              color: '#ffffff',
              borderRadius: '6px',
              padding: '6px 14px',
              fontSize: '0.76rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontFamily: 'inherit',
            }}
          >
            <span>{allSelected ? 'Deselect All' : 'Select All Matched'}</span>
          </button>
          <span style={{ fontSize: '0.76rem', color: '#8b7d95', fontWeight: 600 }}>
            {selectedIds.size} of {matchedSongs.length} selected
          </span>
        </div>

        {/* Frosted Filter input */}
        <div className="osu-glass-card" style={{
          display: 'flex',
          alignItems: 'center',
          borderRadius: '6px',
          padding: '4px 10px',
          gap: '6px',
        }}>
          <Search size={12} color="#8b7d95" />
          <input
            type="text"
            placeholder="Filter list..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '0.76rem',
              outline: 'none',
              fontFamily: 'inherit',
              width: '130px',
            }}
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              style={{
                background: 'none',
                border: 'none',
                color: '#8b7d95',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Frosted Glass Table Container */}
      <div className="osu-glass" style={{
        borderRadius: '10px',
        overflow: 'hidden',
      }}>
        <div style={{ width: '100%', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'auto' }}>
            <thead>
              <tr style={{
                background: 'rgba(18, 16, 24, 0.78)',
                borderBottom: '2px solid rgba(255, 255, 255, 0.08)',
                color: '#8b7d95',
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: 800,
              }}>
                <th style={{ padding: '12px 6px 12px 14px', textAlign: 'center', width: '32px' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isIndeterminate;
                    }}
                    onChange={() => {
                      osuAudio.playClick();
                      if (allSelected) onDeselectAll();
                      else onSelectAll();
                    }}
                    style={{ accentColor: '#ff66aa', width: '14px', height: '14px', cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '12px 6px', textAlign: 'center', width: '32px' }}>#</th>
                <th style={{ padding: '12px 12px' }}>YouTube Song</th>
                <th style={{ padding: '12px 12px' }}>osu! Beatmapset Match</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', width: '130px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSongs.map((song) => (
                <SongRow
                  key={song.id || song.index || song.position}
                  song={song}
                  isSelected={selectedIds.has(song.id)}
                  onToggleSelect={onToggleSelect}
                  activeAudio={activeAudio}
                  onToggleAudio={handleToggleAudio}
                  onDownloadSingle={onDownloadSingle}
                  isDownloading={downloadingIds.has(song.id)}
                  onOpenAltPicker={(s) => setAltPickerSong(s)}
                  onManualSearch={onManualSearch}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Frosted Alternative Beatmap Picker Modal */}
      {altPickerSong && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(10, 8, 14, 0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '16px',
        }}>
          <div className="osu-glass" style={{
            maxWidth: '600px',
            width: '100%',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: '12px',
            border: '2px solid rgba(255, 102, 170, 0.6)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(255, 102, 170, 0.25)',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(18, 16, 24, 0.85)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 900, margin: 0, color: '#ffffff' }}>
                  Select Beatmap Version
                </h3>
                <p style={{ fontSize: '0.74rem', color: '#8b7d95', margin: '2px 0 0' }}>
                  Choose mapset for: <strong>{altPickerSong.cleanQuery || altPickerSong.title}</strong>
                </p>
              </div>
              <button
                className="osu-btn-interactive"
                onClick={() => {
                  osuAudio.playClick();
                  setAltPickerSong(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8b7d95',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal List */}
            <div style={{ padding: '12px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(altPickerSong.allMatches || []).map((bms) => {
                const isSelected = altPickerSong.matchedBeatmap?.id === bms.id;
                return (
                  <div
                    key={bms.id}
                    className="osu-btn-interactive osu-glass-card"
                    onClick={() => {
                      osuAudio.playClick();
                      onSelectAlternativeMatch(altPickerSong.id, bms);
                      setAltPickerSong(null);
                    }}
                    onMouseEnter={() => osuAudio.playHover()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(255, 102, 170, 0.2)' : 'rgba(34, 30, 44, 0.5)',
                      border: `1px solid ${isSelected ? '#ff66aa' : 'rgba(255, 255, 255, 0.08)'}`,
                    }}
                  >
                    <img
                      src={bms.covers?.list || bms.covers?.cover || `https://assets.ppy.sh/beatmaps/${bms.id}/covers/list.jpg`}
                      alt={bms.title}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      style={{ width: '56px', height: '36px', borderRadius: '4px', objectFit: 'cover' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#ffffff' }}>
                        {bms.artist} - {bms.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#c6b8ce', marginTop: '2px' }}>
                        mapped by {bms.creator} • {bms.status} • {bms.bpm} BPM • ★ {bms.starRange?.min?.toFixed(1)}-{bms.starRange?.max?.toFixed(1)}
                      </div>
                    </div>
                    {isSelected && (
                      <div style={{ color: '#ff66aa', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.76rem', fontWeight: 800 }}>
                        <Check size={14} /> Selected
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
