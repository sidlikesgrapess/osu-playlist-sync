'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import PlaylistInput from '@/components/PlaylistInput';
import StatsBar from '@/components/StatsBar';
import SongTable from '@/components/SongTable';
import ExportModal from '@/components/ExportModal';
import SetupGuideModal from '@/components/SetupGuideModal';
import { osuAudio } from '@/lib/soundEffects';
import JSZip from 'jszip';
import confetti from 'canvas-confetti';

function downloadBlob(blob, filename) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [songs, setSongs] = useState([]);
  const [playlistMeta, setPlaylistMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [systemStatus, setSystemStatus] = useState(null);

  // Pagination & Filtering state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [mode, setMode] = useState('all');
  const [statusFilter, setStatusFilter] = useState('any');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [downloadingIds, setDownloadingIds] = useState(new Set());
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  // Modal states
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  // Check system status on mount
  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => setSystemStatus(data))
      .catch(err => console.warn('Could not check system status:', err));
  }, []);

  // Handle fetching a YouTube playlist
  const handleFetchPlaylist = async (url) => {
    setIsLoading(true);
    setErrorMessage('');
    setSongs([]);
    setSelectedIds(new Set());
    setPlaylistMeta(null);
    setCurrentPage(1);

    try {
      const fetchUrl = `/api/playlist?url=${encodeURIComponent(url)}`;
      const res = await fetch(fetchUrl);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Could not load playlist items');
      }

      setPlaylistMeta({
        id: data.playlistId,
        title: data.playlistTitle,
        platform: data.platform,
        isSingleTrack: data.isSingleTrack,
        isDemo: data.isDemo,
      });

      const initialSongs = (data.songs || []).map((s, index) => ({
        ...s,
        id: s.id || `track_${index}`,
        position: index,
        hasSearched: false,
        isSearching: false,
        matchedBeatmap: null,
        allMatches: [],
      }));

      setSongs(initialSongs);
      setIsLoading(false);

      // Only search Page 1 initially to minimize queries!
      const initialPageSize = pageSize === 'all' ? initialSongs.length : pageSize;
      const page1Songs = initialSongs.slice(0, initialPageSize);
      searchTargetSongs(initialSongs, page1Songs.map(s => s.id), mode, statusFilter);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred while loading playlist.');
      setIsLoading(false);
    }
  };

  // Search osu! API for specific target song IDs in controlled batches
  const searchTargetSongs = async (baseSongs, targetIds, currentMode, currentStatus) => {
    if (!targetIds || targetIds.length === 0) return;
    const targetSet = new Set(targetIds);

    setIsSearching(true);
    setSearchProgress(0);

    // Mark targets as searching
    let updated = (baseSongs || songs).map(s => {
      if (targetSet.has(s.id)) {
        return { ...s, isSearching: true };
      }
      return s;
    });
    setSongs([...updated]);

    const targets = updated.filter(s => targetSet.has(s.id));
    let completedCount = 0;
    const concurrency = 3;
    let currentIndex = 0;

    async function searchNext() {
      if (currentIndex >= targets.length) return;
      const targetSong = targets[currentIndex++];

      try {
        const queryParams = new URLSearchParams({
          q: targetSong.cleanQuery || targetSong.title,
          title: targetSong.extractedTitle || targetSong.title || '',
          artist: targetSong.extractedArtist || targetSong.channelTitle || '',
          mode: currentMode,
          status: currentStatus,
        });

        const extraQueries = [
          ...(targetSong.fallbacks || []),
          ...(targetSong.queries || []),
        ];
        if (extraQueries.length > 0) {
          queryParams.set('fallbacks', JSON.stringify(Array.from(new Set(extraQueries))));
        }

        const res = await fetch(`/api/osu/search?${queryParams.toString()}`);
        const result = await res.json();

        setSongs(prev => prev.map(s => {
          if (s.id === targetSong.id) {
            const hasMatch = result.beatmapsets && result.beatmapsets.length > 0;
            const matched = hasMatch ? result.beatmapsets[0] : null;
            if (matched) {
              setSelectedIds(curr => new Set(curr).add(s.id));
            }
            return {
              ...s,
              hasSearched: true,
              isSearching: false,
              matchedBeatmap: matched,
              allMatches: result.beatmapsets || [],
            };
          }
          return s;
        }));
      } catch (err) {
        console.warn(`Search failed for ${targetSong.title}:`, err);
        setSongs(prev => prev.map(s => s.id === targetSong.id ? { ...s, hasSearched: true, isSearching: false, matchedBeatmap: null, allMatches: [] } : s));
      }

      completedCount++;
      setSearchProgress(Math.round((completedCount / targets.length) * 100));

      await searchNext();
    }

    const pool = [];
    for (let i = 0; i < Math.min(concurrency, targets.length); i++) {
      pool.push(searchNext());
    }

    await Promise.all(pool);
    setIsSearching(false);
    osuAudio.playSuccess();
  };

  // Handle Page navigation: automatically lazily query unsearched songs on the new page
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    if (songs.length === 0) return;

    const start = pageSize === 'all' ? 0 : (newPage - 1) * pageSize;
    const end = pageSize === 'all' ? songs.length : start + pageSize;
    const pageSongs = songs.slice(start, end);

    const unsearched = pageSongs.filter(s => !s.hasSearched && !s.isSearching);
    if (unsearched.length > 0) {
      searchTargetSongs(songs, unsearched.map(s => s.id), mode, statusFilter);
    }
  };

  // Handle Page Size change
  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);

    if (songs.length === 0) return;
    const initialPageSize = newSize === 'all' ? songs.length : newSize;
    const page1Songs = songs.slice(0, initialPageSize);
    const unsearched = page1Songs.filter(s => !s.hasSearched && !s.isSearching);
    if (unsearched.length > 0) {
      searchTargetSongs(songs, unsearched.map(s => s.id), mode, statusFilter);
    }
  };

  // Search all remaining unsearched tracks across all pages
  const handleSearchAllRemaining = () => {
    const unsearched = songs.filter(s => !s.hasSearched && !s.isSearching);
    if (unsearched.length > 0) {
      searchTargetSongs(songs, unsearched.map(s => s.id), mode, statusFilter);
    }
  };

  // Re-search when user changes Mode or Status filter
  const handleModeChange = (newMode) => {
    setMode(newMode);
    if (songs.length > 0) {
      const reset = songs.map(s => ({
        ...s,
        hasSearched: false,
        isSearching: false,
        matchedBeatmap: null,
        allMatches: [],
      }));
      setSongs(reset);
      setSelectedIds(new Set());

      const start = pageSize === 'all' ? 0 : (currentPage - 1) * pageSize;
      const end = pageSize === 'all' ? reset.length : start + pageSize;
      const pageSongs = reset.slice(start, end);
      searchTargetSongs(reset, pageSongs.map(s => s.id), newMode, statusFilter);
    }
  };

  const handleStatusFilterChange = (newStatus) => {
    setStatusFilter(newStatus);
    if (songs.length > 0) {
      const reset = songs.map(s => ({
        ...s,
        hasSearched: false,
        isSearching: false,
        matchedBeatmap: null,
        allMatches: [],
      }));
      setSongs(reset);
      setSelectedIds(new Set());

      const start = pageSize === 'all' ? 0 : (currentPage - 1) * pageSize;
      const end = pageSize === 'all' ? reset.length : start + pageSize;
      const pageSongs = reset.slice(start, end);
      searchTargetSongs(reset, pageSongs.map(s => s.id), mode, newStatus);
    }
  };

  // Manual query edit & rematch for a single song
  const handleManualSearch = async (songId, customQuery) => {
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, cleanQuery: customQuery, isSearching: true } : s));

    try {
      const queryParams = new URLSearchParams({
        q: customQuery,
        mode,
        status: statusFilter,
      });

      const res = await fetch(`/api/osu/search?${queryParams.toString()}`);
      const result = await res.json();

      setSongs(prev => prev.map(s => {
        if (s.id === songId) {
          const matched = result.beatmapsets && result.beatmapsets.length > 0 ? result.beatmapsets[0] : null;
          if (matched) {
            setSelectedIds(curr => new Set(curr).add(songId));
          }
          return {
            ...s,
            cleanQuery: customQuery,
            hasSearched: true,
            isSearching: false,
            matchedBeatmap: matched,
            allMatches: result.beatmapsets || [],
          };
        }
        return s;
      }));

      osuAudio.playSuccess();
    } catch (err) {
      console.error('Manual search failed:', err);
      setSongs(prev => prev.map(s => s.id === songId ? { ...s, hasSearched: true, isSearching: false } : s));
    }
  };

  // Selection handlers
  const handleToggleSelect = (songId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  };

  const handleSelectAll = () => {
    const matchedIds = songs.filter(s => s.matchedBeatmap).map(s => s.id);
    setSelectedIds(new Set(matchedIds));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  // Download a single .osz file
  const handleDownloadSingle = async (song) => {
    if (!song.matchedBeatmap) return;
    const beatmapId = song.matchedBeatmap.id;

    setDownloadingIds(prev => new Set(prev).add(song.id));

    try {
      const downloadUrl = `/api/download?beatmapsetId=${beatmapId}&noVideo=true`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const filename = `${beatmapId} ${song.matchedBeatmap.artist} - ${song.matchedBeatmap.title}.osz`.replace(/[\\/*?:"<>|]/g, '_');
      downloadBlob(blob, filename);
      osuAudio.playSuccess();
    } catch (err) {
      console.error(`Download failed for mapset ${beatmapId}:`, err);
      // Fallback: direct browser link
      window.open(`https://catboy.best/d/${beatmapId}`, '_blank');
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(song.id);
        return next;
      });
    }
  };

  // Download batch sequentially
  const handleDownloadBatch = async () => {
    const targetSongs = selectedIds.size > 0
      ? songs.filter(s => selectedIds.has(s.id) && s.matchedBeatmap)
      : songs.filter(s => s.matchedBeatmap);

    if (targetSongs.length === 0) return;

    for (const song of targetSongs) {
      await handleDownloadSingle(song);
      await new Promise(r => setTimeout(r, 600));
    }
  };

  // Bundle as .ZIP
  const handleDownloadZipBatch = async () => {
    const targetSongs = selectedIds.size > 0
      ? songs.filter(s => selectedIds.has(s.id) && s.matchedBeatmap)
      : songs.filter(s => s.matchedBeatmap);

    if (targetSongs.length === 0) return;

    setIsDownloadingZip(true);
    setZipProgress(0);
    const zip = new JSZip();

    try {
      for (let i = 0; i < targetSongs.length; i++) {
        const song = targetSongs[i];
        const beatmapId = song.matchedBeatmap.id;
        const filename = `${beatmapId} ${song.matchedBeatmap.artist} - ${song.matchedBeatmap.title}.osz`.replace(/[\\/*?:"<>|]/g, '_');

        try {
          const downloadUrl = `/api/download?beatmapsetId=${beatmapId}&noVideo=true`;
          const res = await fetch(downloadUrl);
          if (res.ok) {
            const blob = await res.blob();
            zip.file(filename, blob);
          }
        } catch (e) {
          console.warn(`Could not add ${filename} to zip:`, e);
        }

        setZipProgress(Math.round(((i + 1) / targetSongs.length) * 100));
      }

      const zipContent = await zip.generateAsync({ type: 'blob' });
      const safeTitle = (playlistMeta?.title || 'osu_playlist_sync').replace(/[\\/*?:"<>|]/g, '_');
      downloadBlob(zipContent, `${safeTitle}_beatmaps.zip`);

      osuAudio.playSuccess();
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ff66aa', '#3399ff', '#00dd88', '#ffffff']
      });
    } catch (err) {
      console.error('ZIP generation failed:', err);
    } finally {
      setIsDownloadingZip(false);
    }
  };

  // Handle Alternative Beatmap Version Selection
  const handleSelectAlternativeMatch = (songId, newBeatmapset) => {
    setSongs(prev => prev.map(s => {
      if (s.id === songId) {
        return {
          ...s,
          matchedBeatmap: newBeatmapset,
        };
      }
      return s;
    }));
  };

  const handleClearList = () => {
    setSongs([]);
    setPlaylistMeta(null);
    setSelectedIds(new Set());
    setErrorMessage('');
    setCurrentPage(1);
    osuAudio.playClick();
  };

  const matchedCount = songs.filter(s => s.matchedBeatmap).length;
  const searchedCount = songs.filter(s => s.hasSearched).length;
  const unsearchedCount = songs.filter(s => !s.hasSearched).length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Sticky Frosted Glass Header */}
      <Navbar
        onOpenSetupGuide={() => setIsSetupOpen(true)}
        systemStatus={systemStatus}
      />

      {/* Main Content */}
      <main style={{ flex: 1, padding: '0 16px 40px' }}>
        {/* Dynamic Hero Section */}
        <Hero isCompact={songs.length > 0} />

        {/* Liquid Glass Search & Filter Dock */}
        <PlaylistInput
          onFetch={handleFetchPlaylist}
          isLoading={isLoading}
          mode={mode}
          setMode={handleModeChange}
          statusFilter={statusFilter}
          setStatusFilter={handleStatusFilterChange}
        />

        {/* Error Notification */}
        {errorMessage && (
          <div style={{
            maxWidth: '1240px',
            margin: '0 auto 16px',
            background: 'rgba(255, 68, 68, 0.15)',
            border: '1px solid rgba(255, 68, 68, 0.4)',
            borderRadius: '8px',
            padding: '12px 18px',
            color: '#ff8888',
            fontSize: '0.86rem',
            fontWeight: 700,
            backdropFilter: 'blur(10px)',
          }}>
            {errorMessage}
          </div>
        )}

        {/* Playlist Content View */}
        {songs.length > 0 && (
          <>
            {/* Playlist Title & Meta */}
            {playlistMeta?.title && (
              <div style={{ maxWidth: '1240px', margin: '0 auto 10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.05rem', color: '#ff66aa' }}>♪</span>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#ffffff', margin: 0 }}>
                  {playlistMeta.title}
                </h2>
                {playlistMeta.platform && (
                  <span style={{
                    background: playlistMeta.platform === 'spotify' ? 'rgba(29, 185, 84, 0.15)' :
                                playlistMeta.platform === 'apple' ? 'rgba(252, 60, 68, 0.15)' :
                                playlistMeta.platform === 'youtube' ? 'rgba(255, 51, 51, 0.15)' :
                                'rgba(255, 102, 170, 0.15)',
                    color: playlistMeta.platform === 'spotify' ? '#1db954' :
                           playlistMeta.platform === 'apple' ? '#fc3c44' :
                           playlistMeta.platform === 'youtube' ? '#ff4444' :
                           '#ff66aa',
                    border: `1px solid ${
                      playlistMeta.platform === 'spotify' ? 'rgba(29, 185, 84, 0.35)' :
                      playlistMeta.platform === 'apple' ? 'rgba(252, 60, 68, 0.35)' :
                      playlistMeta.platform === 'youtube' ? 'rgba(255, 51, 51, 0.35)' :
                      'rgba(255, 102, 170, 0.35)'
                    }`,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}>
                    {playlistMeta.isSingleTrack ? 'Single Song' : playlistMeta.platform}
                  </span>
                )}
                {playlistMeta.isDemo && (
                  <span style={{
                    background: 'rgba(255, 102, 170, 0.15)',
                    color: '#ff66aa',
                    border: '1px solid rgba(255, 102, 170, 0.3)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                  }}>
                    Showcase
                  </span>
                )}
              </div>
            )}

            {/* Frosted Glass Stats & Action Bar */}
            <StatsBar
              totalSongs={songs.length}
              matchedCount={matchedCount}
              searchedCount={searchedCount}
              selectedCount={selectedIds.size}
              onDownloadAction={handleDownloadBatch}
              onDownloadZipAction={handleDownloadZipBatch}
              isDownloadingZip={isDownloadingZip}
              zipProgress={zipProgress}
              isSearching={isSearching}
              searchProgress={searchProgress}
              onOpenExport={() => setIsExportOpen(true)}
              onClearList={handleClearList}
            />

            {/* Song Table with Intelligent Pagination */}
            <SongTable
              songs={songs}
              currentPage={currentPage}
              onPageChange={handlePageChange}
              pageSize={pageSize}
              onPageSizeChange={handlePageSizeChange}
              unsearchedCount={unsearchedCount}
              onSearchAllRemaining={handleSearchAllRemaining}
              isSearching={isSearching}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onDownloadSingle={handleDownloadSingle}
              downloadingIds={downloadingIds}
              onSelectAlternativeMatch={handleSelectAlternativeMatch}
              onManualSearch={handleManualSearch}
            />
          </>
        )}
      </main>

      {/* Export Links Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        songs={songs}
        playlistTitle={playlistMeta?.title}
      />

      {/* End-User Guide & System Status Modal */}
      <SetupGuideModal
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
      />
    </div>
  );
}
