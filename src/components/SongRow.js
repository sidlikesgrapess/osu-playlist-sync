'use client';

import { useState, memo } from 'react';
import { Download, ExternalLink, Loader2, Music, Layers, Edit3, Check, X } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';
import { getStarColor, getStatusBadgeStyle, describeRejection } from '@/lib/beatmapFormat';
import OsuCheckbox from './OsuCheckbox';
import BeatmapCover from './BeatmapCover';
import { OverrideMark, OverrideNotice } from './MatchNotice';

// Memoized per F-19: the JSX call site (SongTable.js) wraps `onToggleSelect`,
// `onDownloadSingle`, `onOpenAltPicker` and `onManualSearch` with `useStableCallback` so their
// identity does not churn every render, which is what makes this memo actually skip work.
function SongRow({
  song,
  isSelected,
  onToggleSelect,
  isPlaying,
  isPreviewLoading,
  onTogglePreview,
  onDownloadSingle,
  isDownloading,
  onOpenAltPicker,
  onManualSearch,
}) {
  const [isEditingQuery, setIsEditingQuery] = useState(false);
  const [customQuery, setCustomQuery] = useState(song.cleanQuery || song.title || '');
  const [thumbError, setThumbError] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const match = song.matchedBeatmap;
  const hasMatch = Boolean(match);
  const statusStyle = getStatusBadgeStyle(match?.status);
  const rejection = describeRejection(song.rejection);

  const handleQuerySubmit = (e) => {
    e.preventDefault();
    if (!customQuery.trim()) return;
    osuAudio.playClick();
    setIsEditingQuery(false);
    onManualSearch(song.id, customQuery.trim());
  };

  return (
    <tr
      className="osu-table-row"
      style={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        background: isSelected && hasMatch ? 'rgba(255, 102, 170, 0.08)' : '#282532',
      }}
      onMouseEnter={() => osuAudio.playHover()}
    >
      {/* osu! Lazer Checkbox Column */}
      <td style={{ padding: '8px 6px 8px 14px', textAlign: 'center', width: '44px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
          <OsuCheckbox
            id={`checkbox-song-${song.id}`}
            checked={isSelected && hasMatch}
            disabled={!hasMatch}
            unavailable={song.hasSearched && !hasMatch && !song.searchError}
            onChange={() => {
              if (hasMatch) {
                osuAudio.playClick();
                onToggleSelect(song.id);
              }
            }}
            title={hasMatch ? 'Select beatmap' : song.searchError ? 'The search did not finish' : 'No beatmap found for this song'}
          />
          <OverrideMark match={match} song={song} />
        </div>
      </td>

      {/* Index */}
      <td style={{ padding: '8px 6px', textAlign: 'center', color: '#8b7d95', fontSize: '0.78rem', fontWeight: 800, width: '32px' }}>
        {song.position !== undefined ? song.position + 1 : song.index}
      </td>

      {/* YouTube Track Info */}
      <td style={{ padding: '8px 12px', maxWidth: '280px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="osu-thumb-container" style={{ width: '52px', height: '34px', borderRadius: '4px', flexShrink: 0 }}>
            {song.thumbnail && !thumbError ? (
              <img
                src={song.thumbnail}
                alt={song.title}
                loading="lazy"
                decoding="async"
                width={52}
                height={34}
                onError={() => setThumbError(true)}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              />
            ) : (
              <div style={{
                width: '100%',
                height: '100%',
                background: '#343040',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Music size={14} color="#8b7d95" />
              </div>
            )}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="osu-song-title" style={{
              fontSize: '0.84rem',
              fontWeight: 700,
              color: '#ffffff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: '1px',
            }} title={song.title}>
              {song.title}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#8b7d95', fontWeight: 600 }}>
              {song.channelTitle || 'YouTube Track'}
            </div>

            {/* Clean Query Tag with Inline Edit Button */}
            {isEditingQuery ? (
              <form onSubmit={handleQuerySubmit} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                <input
                  type="text"
                  value={customQuery}
                  onChange={(e) => setCustomQuery(e.target.value)}
                  autoFocus
                  style={{
                    background: '#18171c',
                    border: '1px solid #ff66aa',
                    borderRadius: '4px',
                    color: '#ffffff',
                    fontSize: '0.72rem',
                    padding: '2px 5px',
                    outline: 'none',
                    width: '150px',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  type="submit"
                  title="Search osu! for this title"
                  style={{
                    background: '#ff66aa',
                    border: 'none',
                    borderRadius: '3px',
                    color: '#ffffff',
                    padding: '2px 5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Check size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingQuery(false)}
                  style={{
                    background: '#343040',
                    border: 'none',
                    borderRadius: '3px',
                    color: '#8b7d95',
                    padding: '2px 5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <X size={11} />
                </button>
              </form>
            ) : (
              <div style={{
                fontSize: '0.68rem',
                color: '#3399ff',
                marginTop: '2px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(51, 153, 255, 0.12)',
                padding: '1px 5px',
                borderRadius: '3px',
                fontWeight: 700,
              }}>
                <span>Query:</span>
                <span className="mono-font" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {song.cleanQuery}
                </span>
                <button
                  onClick={() => setIsEditingQuery(true)}
                  title="Edit search keywords"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#3399ff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0,
                  }}
                >
                  <Edit3 size={10} />
                </button>
              </div>
            )}
          </div>
        </div>
      </td>

      {/* osu! Beatmap Match Card */}
      <td style={{ padding: '8px 12px', minWidth: '340px' }}>
        {song.isSearching ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ffcc22', fontSize: '0.8rem', fontWeight: 700 }}>
            <Loader2 size={13} className="spin-slow" />
            <span>Finding beatmaps...</span>
          </div>
        ) : hasMatch ? (
          <div>
            {/* No beatmap by the target artist exists, so what follows is the nearest thing
                found. Said as a sentence introducing the result, not a label on it. */}
            <OverrideNotice match={match} song={song} />
            {previewError && (
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#ff8888', marginBottom: '4px' }}>
                Preview unavailable
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* Beatmap Cover with Play Preview Overlay */}
            <BeatmapCover
              key={match.covers?.list || match.id}
              coverUrl={match.covers?.list || match.covers?.cover}
              fallbackId={match.id}
              alt={match.title}
              width={68}
              height={42}
              fallbackIconSize={16}
              playIconSize={15}
              waveBarCount={5}
              playButtonClassName="osu-play-btn"
              previewUrl={match.previewUrl}
              isPlaying={isPlaying}
              isPreviewLoading={isPreviewLoading}
              onPreviewErrorChange={setPreviewError}
              onTogglePreview={() => {
                osuAudio.playClick();
                return onTogglePreview(match.previewUrl);
              }}
            />

            {/* Beatmap details */}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.86rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {match.artist} - {match.title}
                </span>

                {/* Status Badge */}
                <span style={{
                  fontSize: '0.66rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  background: statusStyle.bg,
                  color: statusStyle.color,
                }}>
                  {match.status}
                </span>
              </div>

              <div style={{
                fontSize: '0.73rem',
                color: '#c6b8ce',
                marginTop: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap',
                fontWeight: 600,
              }}>
                <span>mapped by <strong style={{ color: '#ffffff' }}>{match.creator}</strong></span>
                <span>•</span>
                <span>{match.bpm} BPM</span>
                <span>•</span>
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  background: 'rgba(0, 0, 0, 0.4)',
                  color: getStarColor(match.starRange?.max),
                }}>
                  ★ {match.starRange?.min?.toFixed(1)} - {match.starRange?.max?.toFixed(1)}
                </span>
              </div>

              {/* Alternative Versions Link */}
              {song.allMatches && song.allMatches.length > 1 && (
                <button
                  onClick={() => {
                    osuAudio.playClick();
                    onOpenAltPicker(song);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ff66aa',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    marginTop: '2px',
                    padding: 0,
                    textDecoration: 'underline',
                    fontFamily: 'inherit',
                  }}
                >
                  <Layers size={10} />
                  <span>{song.allMatches.length} versions available (change)</span>
                </button>
              )}
            </div>
            </div>
          </div>
        ) : song.searchError ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#8b7d95', fontSize: '0.76rem', fontWeight: 600 }}>
              {song.searchError === 'rate-limited' ? 'osu! is busy. Try again in a minute.' : 'The search failed. Try again.'}
            </span>
            <button
              onClick={() => onManualSearch(song.id, song.cleanQuery || song.title)}
              className="osu-btn-interactive osu-glass-card"
              style={{
                color: '#ff66aa',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Retry
            </button>
          </div>
        ) : song.hasSearched === false ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#8b7d95', fontSize: '0.76rem', fontWeight: 600 }}>
              Not searched yet
            </span>
            <button
              onClick={() => onManualSearch(song.id, song.cleanQuery || song.title)}
              className="osu-btn-interactive osu-glass-card"
              style={{
                color: '#ff66aa',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Search
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#8b7d95', fontSize: '0.78rem', fontWeight: 600 }}>
              {rejection.message}
              {rejection.hint && <em style={{ opacity: 0.8 }}> ({rejection.hint})</em>}
            </span>
            <button
              onClick={() => setIsEditingQuery(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#ff66aa',
                fontSize: '0.74rem',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Try different keywords
            </button>
          </div>
        )}
      </td>

      {/* Download Action */}
      <td style={{ padding: '8px 14px', textAlign: 'right', whiteSpace: 'nowrap', width: '130px' }}>
        {hasMatch && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <a
              href={`https://osu.ppy.sh/beatmapsets/${match.id}`}
              target="_blank"
              rel="noreferrer"
              className="osu-btn-interactive"
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                background: '#343040',
                color: '#c6b8ce',
                padding: '6px',
                borderRadius: '5px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
              }}
              title="View on osu! website"
            >
              <ExternalLink size={13} />
            </a>

            <button
              className="osu-btn-interactive osu-btn-pink"
              onClick={() => {
                osuAudio.playClick();
                onDownloadSingle(song);
              }}
              disabled={isDownloading}
              onMouseEnter={() => osuAudio.playHover()}
              style={{
                border: 'none',
                padding: '6px 12px',
                borderRadius: '5px',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontFamily: 'inherit',
              }}
              title="Download .osz file"
            >
              {isDownloading ? (
                <>
                  <Loader2 size={12} className="spin-slow" />
                  <span>Fetching...</span>
                </>
              ) : (
                <>
                  <Download size={12} />
                  <span>.OSZ</span>
                </>
              )}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default memo(SongRow);
