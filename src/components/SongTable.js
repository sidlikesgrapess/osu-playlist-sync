'use client';

import { useState, useRef, useEffect } from 'react';
import SongRow from './SongRow';
import OsuCheckbox from './OsuCheckbox';
import { X, Check, Search, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function SongTable({
  songs,
  currentPage = 1,
  onPageChange,
  pageSize = 10,
  onPageSizeChange,
  unsearchedCount = 0,
  onSearchAllRemaining,
  isSearching = false,
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

  // Filter songs by search term
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

  // Calculate Pagination Slicing
  const totalItems = filteredSongs.length;
  const numericPageSize = pageSize === 'all' ? totalItems : Number(pageSize);
  const totalPages = pageSize === 'all' || totalItems === 0 ? 1 : Math.ceil(totalItems / numericPageSize);
  const validCurrentPage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
  const startIndex = pageSize === 'all' ? 0 : (validCurrentPage - 1) * numericPageSize;
  const paginatedSongs = pageSize === 'all' ? filteredSongs : filteredSongs.slice(startIndex, startIndex + numericPageSize);

  // Generate page numbers for navigation (e.g. 1, 2, 3...)
  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (validCurrentPage <= 3) {
      return [1, 2, 3, 4, '...', totalPages];
    }
    if (validCurrentPage >= totalPages - 2) {
      return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', validCurrentPage - 1, validCurrentPage, validCurrentPage + 1, '...', totalPages];
  };

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
              }}
            >
              <X size={12} />
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
                  <OsuCheckbox
                    id="select-all-header-checkbox"
                    checked={allSelected}
                    indeterminate={isIndeterminate}
                    disabled={matchedSongs.length === 0}
                    onChange={() => {
                      if (allSelected) onDeselectAll();
                      else onSelectAll();
                    }}
                    title={allSelected ? 'Deselect all beatmaps' : 'Select all matched beatmaps'}
                  />
                </th>
                <th style={{ padding: '12px 6px', textAlign: 'center', width: '32px' }}>#</th>
                <th style={{ padding: '12px 12px' }}>Track / Song</th>
                <th style={{ padding: '12px 12px' }}>osu! Beatmapset Match</th>
                <th style={{ padding: '12px 14px', textAlign: 'right', width: '130px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSongs.map((song) => (
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

      {/* Frosted Glass Pagination Bar */}
      {totalItems > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginTop: '12px',
          padding: '10px 16px',
          background: 'rgba(28, 25, 36, 0.65)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
        }}>
          {/* Left: Summary & Unsearched Helper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: '#c6b8ce', fontWeight: 600 }}>
              Showing <strong style={{ color: '#ffffff' }}>{totalItems === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + (pageSize === 'all' ? totalItems : numericPageSize), totalItems)}</strong> of <strong style={{ color: '#ffffff' }}>{totalItems}</strong> songs
            </span>

            {unsearchedCount > 0 && onSearchAllRemaining && (
              <button
                className="osu-btn-interactive"
                onClick={() => {
                  osuAudio.playClick();
                  onSearchAllRemaining();
                }}
                disabled={isSearching}
                style={{
                  background: 'rgba(255, 102, 170, 0.15)',
                  border: '1px solid rgba(255, 102, 170, 0.35)',
                  color: '#ff66aa',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: '5px',
                  cursor: isSearching ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  opacity: isSearching ? 0.6 : 1,
                  fontFamily: 'inherit',
                }}
                title="Query beatmaps for all unsearched pages"
              >
                <Sparkles size={11} />
                <span>Search all remaining ({unsearchedCount})</span>
              </button>
            )}
          </div>

          {/* Center: Page Number Tabs */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                id="pagination-prev-btn"
                className="osu-btn-interactive"
                onClick={() => {
                  if (validCurrentPage > 1) {
                    osuAudio.playClick();
                    onPageChange(validCurrentPage - 1);
                  }
                }}
                disabled={validCurrentPage <= 1}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: validCurrentPage <= 1 ? '#554d60' : '#c6b8ce',
                  borderRadius: '5px',
                  padding: '4px 8px',
                  cursor: validCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  fontFamily: 'inherit',
                }}
              >
                <ChevronLeft size={14} />
              </button>

              {getPageNumbers().map((p, idx) => (
                typeof p === 'number' ? (
                  <button
                    key={p}
                    id={`pagination-page-${p}`}
                    className="osu-btn-interactive"
                    onClick={() => {
                      osuAudio.playClick();
                      onPageChange(p);
                    }}
                    style={{
                      background: validCurrentPage === p ? '#ff66aa' : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${validCurrentPage === p ? '#ff66aa' : 'rgba(255, 255, 255, 0.08)'}`,
                      color: validCurrentPage === p ? '#ffffff' : '#c6b8ce',
                      borderRadius: '5px',
                      minWidth: '28px',
                      height: '28px',
                      padding: '0 6px',
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: validCurrentPage === p ? '0 0 12px rgba(255, 102, 170, 0.5)' : 'none',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p}
                  </button>
                ) : (
                  <span key={`dots_${idx}`} style={{ color: '#8b7d95', padding: '0 4px', fontSize: '0.74rem' }}>
                    ...
                  </span>
                )
              ))}

              <button
                id="pagination-next-btn"
                className="osu-btn-interactive"
                onClick={() => {
                  if (validCurrentPage < totalPages) {
                    osuAudio.playClick();
                    onPageChange(validCurrentPage + 1);
                  }
                }}
                disabled={validCurrentPage >= totalPages}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: validCurrentPage >= totalPages ? '#554d60' : '#c6b8ce',
                  borderRadius: '5px',
                  padding: '4px 8px',
                  cursor: validCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  fontFamily: 'inherit',
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Right: Page Size Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 800, textTransform: 'uppercase' }}>
              Per page:
            </span>
            {[10, 25, 50, 'all'].map((size) => (
              <button
                key={size}
                id={`page-size-${size}`}
                className="osu-pill-tab"
                onClick={() => {
                  osuAudio.playClick();
                  onPageSizeChange(size);
                }}
                style={{
                  background: pageSize === size ? '#3399ff' : 'rgba(255, 255, 255, 0.05)',
                  color: pageSize === size ? '#ffffff' : '#c6b8ce',
                  border: `1px solid ${pageSize === size ? '#3399ff' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '5px',
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: pageSize === size ? '0 0 10px rgba(51, 153, 255, 0.5)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                {size === 'all' ? 'All' : size}
              </button>
            ))}
          </div>
        </div>
      )}

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
                onClick={() => {
                  osuAudio.playClick();
                  setAltPickerSong(null);
                }}
                style={{ background: 'none', border: 'none', color: '#8b7d95', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal List */}
            <div style={{ padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(altPickerSong.allMatches || []).map((match) => {
                const isSelected = altPickerSong.matchedBeatmap?.id === match.id;
                return (
                  <div
                    key={match.id}
                    className="osu-btn-interactive osu-glass-card"
                    onClick={() => {
                      osuAudio.playClick();
                      onSelectAlternativeMatch(altPickerSong.id, match);
                      setAltPickerSong(null);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: isSelected ? '1px solid #ff66aa' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: isSelected ? 'rgba(255, 102, 170, 0.15)' : 'rgba(28, 25, 36, 0.6)',
                    }}
                  >
                    <img
                      src={match.covers?.list || match.covers?.cover || `https://assets.ppy.sh/beatmaps/${match.id}/covers/list.jpg`}
                      alt={match.title}
                      style={{ width: '60px', height: '38px', borderRadius: '4px', objectFit: 'cover' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {match.artist} - {match.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#c6b8ce', display: 'flex', gap: '8px' }}>
                        <span>mapped by {match.creator}</span>
                        <span>•</span>
                        <span>{match.bpm} BPM</span>
                      </div>
                    </div>
                    {isSelected && (
                      <span style={{ color: '#ff66aa', fontSize: '0.74rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Check size={14} /> Active
                      </span>
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
