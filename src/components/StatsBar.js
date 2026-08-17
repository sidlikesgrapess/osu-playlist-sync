'use client';

import { Download, Archive, CheckCircle2, Share2, Trash2 } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function StatsBar({
  totalSongs,
  matchedCount,
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
  const matchPercentage = totalSongs > 0 ? Math.round((matchedCount / totalSongs) * 100) : 0;
  const isSelective = selectedCount > 0 && selectedCount < matchedCount;
  const targetCount = isSelective ? selectedCount : matchedCount;

  return (
    <div className="osu-glass" style={{
      maxWidth: '1240px',
      margin: '0 auto 14px',
      padding: '12px 18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '12px',
      borderRadius: '10px',
    }}>
      {/* Metrics Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.68rem', color: '#8b7d95', textTransform: 'uppercase', fontWeight: 800 }}>
            Playlist Songs
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#ffffff' }}>
            {totalSongs}
          </div>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.08)' }} />

        <div>
          <div style={{ fontSize: '0.68rem', color: '#8b7d95', textTransform: 'uppercase', fontWeight: 800 }}>
            Beatmap Matches
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#00dd88', textShadow: '0 0 14px rgba(0, 221, 136, 0.4)' }}>
            {matchedCount} <span style={{ fontSize: '0.74rem', color: '#8b7d95' }}>({matchPercentage}%)</span>
          </div>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255, 255, 255, 0.08)' }} />

        <div>
          <div style={{ fontSize: '0.68rem', color: '#8b7d95', textTransform: 'uppercase', fontWeight: 800 }}>
            Status
          </div>
          <div style={{ fontSize: '0.78rem', fontWeight: 800 }}>
            {isSearching ? (
              <span style={{ color: '#ffcc22' }}>Searching beatmaps ({searchProgress}%)...</span>
            ) : matchedCount > 0 ? (
              <span style={{ color: '#44bbee', display: 'flex', alignItems: 'center', gap: '4px', textShadow: '0 0 10px rgba(68, 187, 238, 0.4)' }}>
                <CheckCircle2 size={14} /> Ready for download
              </span>
            ) : (
              <span style={{ color: '#8b7d95' }}>Idle</span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
            fontSize: '0.76rem',
            padding: '7px 12px',
            cursor: matchedCount === 0 || isSearching ? 'not-allowed' : 'pointer',
            opacity: matchedCount === 0 || isSearching ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: 'inherit',
          }}
          title="Export URLs or osu! Direct links"
        >
          <Share2 size={13} />
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
            fontSize: '0.78rem',
            padding: '7px 14px',
            cursor: targetCount === 0 || isSearching ? 'not-allowed' : 'pointer',
            opacity: targetCount === 0 || isSearching ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'inherit',
          }}
        >
          <Download size={14} />
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
            fontSize: '0.78rem',
            padding: '7px 16px',
            borderRadius: '6px',
            cursor: targetCount === 0 || isDownloadingZip || isSearching ? 'not-allowed' : 'pointer',
            opacity: targetCount === 0 || isDownloadingZip || isSearching ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'inherit',
          }}
        >
          <Archive size={14} />
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
          }}
          title="Clear playlist results"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
