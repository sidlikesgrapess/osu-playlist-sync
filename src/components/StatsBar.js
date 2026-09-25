'use client';

import { Download, Archive, CheckCircle2, Share2, Trash2, X } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function StatsBar({
  totalSongs,
  totalLabel = 'Playlist Songs',
  matchedCount,
  searchedCount,
  selectedCount,
  onDownloadAction,
  onDownloadZipAction,
  isDownloadingZip,
  zipProgress,
  isBatchActive = false,
  onCancelBatch,
  isSearching,
  searchProgress,
  unsearchedCount = 0,
  onSearchAllRemaining,
  onOpenExport,
  onClearList,
  clearTitle = 'Clear playlist results',
  // The metrics describe the view on screen, but Download, ZIP, Export and the count cover
  // both searches at once (todo item 09). `downloadableCount` is every matched beatmapset
  // across both, `downloadsLocked` holds the buttons while any of it is still being searched,
  // and `otherSideNote` says how much of the count lives in the view that is not shown.
  downloadableCount = matchedCount,
  downloadsLocked = isSearching,
  otherSideNote = '',
}) {
  const effectiveTotal = searchedCount !== undefined && searchedCount > 0 ? searchedCount : totalSongs;
  const matchPercentage = effectiveTotal > 0 ? Math.round((matchedCount / effectiveTotal) * 100) : 0;
  const isEverythingSelected = downloadableCount > 0 && selectedCount === downloadableCount;
  const exportDisabled = downloadableCount === 0 || downloadsLocked;
  const downloadDisabled = selectedCount === 0 || downloadsLocked || isBatchActive;
  const zipDisabled = downloadDisabled || isDownloadingZip;

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
            {totalLabel}
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
        {otherSideNote && (
          <span data-testid="stats-other-side" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9a90a6', marginRight: '2px' }}>
            {otherSideNote}
          </span>
        )}

        {/* Search All Remaining button */}
        {unsearchedCount > 0 && onSearchAllRemaining && (
          <button
            className="osu-btn-interactive osu-glass-card"
            onClick={() => {
              osuAudio.playClick();
              onSearchAllRemaining();
            }}
            disabled={isSearching}
            onMouseEnter={() => osuAudio.playHover()}
            style={{
              borderRadius: '6px',
              color: '#ff66aa',
              border: '1px solid rgba(255, 102, 170, 0.35)',
              background: '#2c2234',
              fontWeight: 800,
              fontSize: '0.75rem',
              padding: '6px 10px',
              cursor: isSearching ? 'not-allowed' : 'pointer',
              opacity: isSearching ? 0.5 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'inherit',
              minHeight: '34px',
            }}
            title="Query beatmaps for all unsearched songs"
          >
            <span>Search All ({unsearchedCount})</span>
          </button>
        )}

        {/* Export Links button */}
        <button
          className="osu-btn-interactive osu-glass-card"
          onClick={() => {
            osuAudio.playClick();
            onOpenExport();
          }}
          disabled={exportDisabled}
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            borderRadius: '6px',
            color: '#c6b8ce',
            fontWeight: 800,
            fontSize: '0.75rem',
            padding: '6px 10px',
            cursor: exportDisabled ? 'not-allowed' : 'pointer',
            opacity: exportDisabled ? 0.5 : 1,
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
          disabled={downloadDisabled}
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            borderRadius: '6px',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '0.75rem',
            padding: '6px 12px',
            cursor: downloadDisabled ? 'not-allowed' : 'pointer',
            opacity: downloadDisabled ? 0.5 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            fontFamily: 'inherit',
            minHeight: '34px',
          }}
        >
          <Download size={13} />
          <span>
            {isEverythingSelected ? `Download All (${selectedCount})` : `Download (${selectedCount})`}
          </span>
        </button>

        {/* Bundle as .ZIP */}
        <button
          className="osu-btn-interactive osu-btn-pink"
          onClick={onDownloadZipAction}
          disabled={zipDisabled}
          onMouseEnter={() => osuAudio.playHover()}
          style={{
            border: 'none',
            fontWeight: 800,
            fontSize: '0.76rem',
            padding: '6px 14px',
            borderRadius: '6px',
            cursor: zipDisabled ? 'not-allowed' : 'pointer',
            opacity: zipDisabled ? 0.5 : 1,
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
              : isEverythingSelected
              ? `Bundle as .ZIP (${selectedCount})`
              : `ZIP (${selectedCount})`}
          </span>
        </button>

        {/* Cancel the running batch. Same card style as Download, shown only while one runs. */}
        {isBatchActive && onCancelBatch && (
          <button
            className="osu-btn-interactive osu-glass-card"
            onClick={onCancelBatch}
            onMouseEnter={() => osuAudio.playHover()}
            style={{
              borderRadius: '6px',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.75rem',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontFamily: 'inherit',
              minHeight: '34px',
            }}
            title="Stop the running download"
          >
            <X size={13} />
            <span>Cancel</span>
          </button>
        )}

        {/* Clear this view's side. Absent when the view has nothing of its own to clear. */}
        {onClearList && (
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
          title={clearTitle}
          aria-label={clearTitle}
        >
          <Trash2 size={14} />
        </button>
        )}
      </div>
    </div>
  );
}
