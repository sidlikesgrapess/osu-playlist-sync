'use client';

import { useState, useRef, useEffect } from 'react';
import SongRow from './SongRow';
import SongCardMobile from './SongCardMobile';
import OsuCheckbox from './OsuCheckbox';
import { X, Check, Search, ChevronLeft, ChevronRight, Sparkles, Heart, Play, Star } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

const getStarColor = (stars) => {
  if (!stars) return '#c6b8ce';
  if (stars < 2.5) return '#4fc3f7';
  if (stars < 4.0) return '#81c784';
  if (stars < 5.3) return '#ffb74d';
  if (stars < 6.5) return '#ff8a80';
  return '#ba68c8';
};

const formatCompactNumber = (num) => {
  if (num === null || num === undefined || isNaN(Number(num))) return '0';
  const val = Number(num);
  if (val >= 1_000_000) {
    return (val / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (val >= 1_000) {
    return (val / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return val.toLocaleString();
};

const getStatusBadgeStyle = (status = '') => {
  const s = status.toLowerCase();
  if (s === 'ranked') return { bg: '#44bbee', color: '#081a24' };
  if (s === 'loved') return { bg: '#ff66aa', color: '#ffffff' };
  if (s === 'qualified') return { bg: '#3399ff', color: '#ffffff' };
  if (s === 'pending') return { bg: '#ffcc22', color: '#081a24' };
  if (s === 'wip') return { bg: '#ff9944', color: '#081a24' };
  return { bg: '#5a5266', color: '#ffffff' };
};

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

      {/* Frosted Glass Table Container (Desktop / Tablet) */}
      <div className="osu-glass osu-table-desktop" style={{
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
                <th style={{ padding: '12px 12px' }}>Match</th>
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

      {/* Frosted Glass Mobile Card List (Mobile Screens <= 768px) */}
      <div className="osu-table-mobile">
        {paginatedSongs.map((song) => (
          <SongCardMobile
            key={`mobile-${song.id || song.index || song.position}`}
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
      </div>

      {/* Clean Solid Pagination Bar */}
      {totalItems > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginTop: '12px',
          padding: '10px 16px',
          background: '#1c1a25',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
        }}>
          {/* Left: Summary & Unsearched Helper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: '#c0b4c8', fontWeight: 600 }}>
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
                  background: '#2c2234',
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
                  background: '#262232',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: validCurrentPage <= 1 ? '#554d60' : '#c0b4c8',
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
                      background: validCurrentPage === p ? '#ff66aa' : '#262232',
                      border: `1px solid ${validCurrentPage === p ? '#ff66aa' : 'rgba(255, 255, 255, 0.08)'}`,
                      color: validCurrentPage === p ? '#ffffff' : '#c0b4c8',
                      borderRadius: '5px',
                      minWidth: '28px',
                      height: '28px',
                      padding: '0 6px',
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p}
                  </button>
                ) : (
                  <span key={`dots_${idx}`} style={{ color: '#887c93', padding: '0 4px', fontSize: '0.74rem' }}>
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
                  background: '#262232',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: validCurrentPage >= totalPages ? '#554d60' : '#c0b4c8',
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
            <span style={{ fontSize: '0.72rem', color: '#887c93', fontWeight: 800, textTransform: 'uppercase' }}>
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
                  background: pageSize === size ? '#3399ff' : '#262232',
                  color: pageSize === size ? '#ffffff' : '#c0b4c8',
                  border: `1px solid ${pageSize === size ? '#3399ff' : 'rgba(255, 255, 255, 0.08)'}`,
                  borderRadius: '5px',
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {size === 'all' ? 'All' : size}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clean Solid Alternative Beatmap Picker Modal */}
      {altPickerSong && (
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
            maxWidth: '640px',
            width: '100%',
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7)',
            background: '#1d1b26',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: '#171520',
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
                const minStars = match.starRange?.min ?? (match.difficulties?.length ? Math.min(...match.difficulties.map(d => d.difficultyRating || 0)) : null);
                const maxStars = match.starRange?.max ?? (match.difficulties?.length ? Math.max(...match.difficulties.map(d => d.difficultyRating || 0)) : null);
                const starRatingText = minStars !== null && maxStars !== null
                  ? (Math.abs(minStars - maxStars) < 0.05 ? `★ ${minStars.toFixed(1)}` : `★ ${minStars.toFixed(1)} - ${maxStars.toFixed(1)}`)
                  : null;
                const playCount = match.playCount ?? match.play_count ?? 0;
                const favouriteCount = match.favouriteCount ?? match.favourite_count ?? 0;
                const statusStyle = getStatusBadgeStyle(match.status || '');
                const isPreviewPlaying = activeAudio === `alt-${match.id}`;

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
                      padding: '10px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: isSelected ? '1px solid #ff66aa' : '1px solid rgba(255, 255, 255, 0.08)',
                      background: isSelected ? 'rgba(255, 102, 170, 0.18)' : 'rgba(32, 28, 42, 0.8)',
                      contentVisibility: 'auto',
                      containIntrinsicSize: '0 62px',
                    }}
                  >
                    {/* Beatmap Cover with Play Preview Overlay */}
                    <div style={{
                      position: 'relative',
                      width: '64px',
                      height: '42px',
                      borderRadius: '5px',
                      flexShrink: 0,
                      overflow: 'hidden',
                      background: '#343040',
                    }}>
                      <img
                        src={match.covers?.list || match.covers?.cover || `https://assets.ppy.sh/beatmaps/${match.id}/covers/list.jpg`}
                        alt={match.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {match.previewUrl && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            osuAudio.playClick();
                            handleToggleAudio(`alt-${match.id}`, match.previewUrl);
                          }}
                          title={isPreviewPlaying ? 'Pause audio preview' : 'Play audio preview'}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background: isPreviewPlaying ? 'rgba(16, 14, 22, 0.75)' : 'rgba(0, 0, 0, 0.35)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'background 0.2s ease',
                          }}
                        >
                          {isPreviewPlaying ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                              <div className="osu-wave-bar" style={{ width: '2.5px' }} />
                              <div className="osu-wave-bar" style={{ width: '2.5px' }} />
                              <div className="osu-wave-bar" style={{ width: '2.5px' }} />
                            </div>
                          ) : (
                            <Play size={13} color="#ffffff" style={{ fill: '#ffffff' }} />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Beatmap Details */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '0.84rem',
                          fontWeight: 800,
                          color: '#ffffff',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {match.artist} - {match.title}
                        </span>

                        {/* Status Badge */}
                        {match.status && (
                          <span style={{
                            fontSize: '0.62rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: statusStyle.bg,
                            color: statusStyle.color,
                            flexShrink: 0,
                          }}>
                            {match.status}
                          </span>
                        )}
                      </div>

                      {/* Stats & Mapper */}
                      <div style={{
                        fontSize: '0.72rem',
                        color: '#c6b8ce',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}>
                        <span>mapped by <strong style={{ color: '#ffffff' }}>{match.creator}</strong></span>
                        <span>•</span>
                        <span>{match.bpm} BPM</span>

                        {/* Star Rating Badge */}
                        {starRatingText && (
                          <>
                            <span>•</span>
                            <span
                              title={`Difficulty: ${starRatingText}`}
                              style={{
                                fontFamily: 'JetBrains Mono, monospace',
                                fontWeight: 700,
                                fontSize: '0.68rem',
                                padding: '1px 5px',
                                borderRadius: '3px',
                                background: 'rgba(0, 0, 0, 0.45)',
                                color: getStarColor(maxStars),
                              }}
                            >
                              {starRatingText}
                            </span>
                          </>
                        )}

                        {/* Play Count */}
                        <span>•</span>
                        <span
                          title={`${Number(playCount).toLocaleString()} plays`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            color: '#c6b8ce',
                            fontSize: '0.70rem',
                            fontWeight: 600,
                          }}
                        >
                          <Play size={10} style={{ fill: '#c6b8ce', flexShrink: 0 }} />
                          <span>{formatCompactNumber(playCount)}</span>
                        </span>

                        {/* Likes / Favorites */}
                        <span>•</span>
                        <span
                          title={`${Number(favouriteCount).toLocaleString()} favourites / likes`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            color: '#ff66aa',
                            fontSize: '0.70rem',
                            fontWeight: 700,
                          }}
                        >
                          <Heart size={10} style={{ fill: '#ff66aa', flexShrink: 0 }} />
                          <span>{formatCompactNumber(favouriteCount)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Active Match Badge */}
                    {isSelected && (
                      <span style={{ color: '#ff66aa', fontSize: '0.74rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
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
