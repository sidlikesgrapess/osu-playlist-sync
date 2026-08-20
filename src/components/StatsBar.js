'use client';

import { Download, Archive, CheckCircle2, Share2, Trash2 } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function StatsBar({
  totalSongs,
  matchedCount,
  searchedCount,
  selectedCount,
  onDownloadAction,
  onDownloadZipAction,
  isDownloadingZip,
  zipProgress,
  isSearching,
  searchProgress,
  onOpenExport,
  onClearList,
}) {
  const effectiveTotal = searchedCount !== undefined && searchedCount > 0 ? searchedCount : totalSongs;
  const matchPercentage = effectiveTotal > 0 ? Math.round((matchedCount / effectiveTotal) * 100) : 0;
  const isSelective = selectedCount > 0 && selectedCount < matchedCount;
  const targetCount = isSelective ? selectedCount : matchedCount;

  return (
    <div className="osu-glass" style={{
      maxWidth: '1240px',
      margin: '0 auto 12px',
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '10px',
      borderRadius: '10px',
    }}>
      {/* Metrics Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 3vw, 18px)', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.66rem', color: '#8b7d95', textTransform: 'uppercase', fontWeight: 800 }}>
            Playlist Songs
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffffff' }}>
            {totalSongs}
          </div>
        </div>

        <div style={{ width: '1px', height: '22px', background: 'rgba(255, 255, 255, 0.08)' }} />

        <div>
          <div style={{ fontSize: '0.66rem', color: '#887c93', textTransform: 'uppercase', fontWeight: 800 }}>
            Beatmap Matches
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#00cc77' }}>
            {matchedCount} <span style={{ fontSize: '0.72rem', color: '#887c93' }}>
              {searchedCount !== undefined && searchedCount < totalSongs
                ? `(${searchedCount}/${totalSongs})`
                : `(${matchPercentage}%)`}
            </span>
          </div>
        </div>

        <div style={{ width: '1px', height: '22px', background: 'rgba(255, 255, 255, 0.08)' }} />

        <div>
          <div style={{ fontSize: '0.66rem', color: '#887c93', textTransform: 'uppercase', fontWeight: 800 }}>
            Status
          </div>
          <div style={{ fontSize: '0.76rem', fontWeight: 800 }}>
            {isSearching ? (
              <span style={{ color: '#ffbb22' }}>Searching ({searchProgress}%)...</span>
            ) : matchedCount > 0 ? (
              <span style={{ color: '#44bbee', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} /> Ready
              </span>
            ) : (
              <span style={{ color: '#887c93' }}>Idle</span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', width: 'auto' }}>
        {/* Export Links button */}
        <button
          className="osu-btn-interactive osu-glass-card"
          onClick={() => {
            osuAudio.playClick();
            onOpenExport();
          }}
          disabled={matchedCount === 0 || isSearching}
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            borderRadius: '6px',
            color: '#c6b8ce',
            fontWeight: 800,
            fontSize: '0.75rem',
            padding: '6px 10px',
            cursor: matchedCount === 0 || isSearching ? 'not-allowed' : 'pointer',
            opacity: matchedCount === 0 || isSearching ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontFamily: 'inherit',
            minHeight: '34px',
          }}
          title="Export URLs or osu! Direct links"
        >
          <Share2 size={12} />
          <span>Export</span>
        </button>

        {/* Download All / Selected */}
        <button
          className="osu-btn-interactive osu-glass-card"
          onClick={onDownloadAction}
          disabled={targetCount === 0 || isSearching}
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            borderRadius: '6px',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '0.75rem',
            padding: '6px 12px',
            cursor: targetCount === 0 || isSearching ? 'not-allowed' : 'pointer',
            opacity: targetCount === 0 || isSearching ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: 'inherit',
            minHeight: '34px',
          }}
        >
          <Download size={13} />
          <span>
            {isSelective ? `Download (${selectedCount})` : `Download All (${matchedCount})`}
          </span>
        </button>

        {/* Bundle as .ZIP */}
        <button
          className="osu-btn-interactive osu-btn-pink"
          onClick={onDownloadZipAction}
          disabled={targetCount === 0 || isDownloadingZip || isSearching}
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            border: 'none',
            fontWeight: 800,
            fontSize: '0.76rem',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: targetCount === 0 || isDownloadingZip || isSearching ? 'not-allowed' : 'pointer',
            opacity: targetCount === 0 || isDownloadingZip || isSearching ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: 'inherit',
            minHeight: '34px',
          }}
        >
          <Archive size={13} />
          <span>
            {isDownloadingZip
              ? `Zipping (${zipProgress}%)...`
              : isSelective
              ? `ZIP (${selectedCount})`
              : `Bundle as .ZIP (${matchedCount})`}
          </span>
        </button>

        {/* Clear List */}
        <button
          className="osu-btn-interactive"
          onClick={() => {
            osuAudio.playClick();
            onClearList();
          }}
          disabled={isSearching}
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            background: 'none',
            border: 'none',
            color: '#8b7d95',
            padding: '6px',
            borderRadius: '6px',
            cursor: isSearching ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '34px',
            minWidth: '34px',
          }}
          title="Clear playlist results"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
