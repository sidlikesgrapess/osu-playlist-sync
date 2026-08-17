'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import PlaylistInput from '@/components/PlaylistInput';
import StatsBar from '@/components/StatsBar';
import SongTable from '@/components/SongTable';
import SetupGuideModal from '@/components/SetupGuideModal';
import ExportModal from '@/components/ExportModal';
import JSZip from 'jszip';
import confetti from 'canvas-confetti';
import { Music2, AlertCircle, Sparkles } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';

export default function Home() {
  const [songs, setSongs] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [playlistMeta, setPlaylistMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchProgress, setSearchProgress] = useState(0);
  const [downloadingIds, setDownloadingIds] = useState(new Set());
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [systemStatus, setSystemStatus] = useState(null);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [mode, setMode] = useState('all');
  const [statusFilter, setStatusFilter] = useState('any');
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch status on mount
  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => setSystemStatus(data))
      .catch(e => console.warn('Failed to load system status:', e));
  }, []);

  // Expose fetch handler for testing and external trigger
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.fetchPlaylist = (targetUrl) => handleFetchPlaylist(targetUrl);
    }
  }, [mode, statusFilter]);

  // Fetch playlist and trigger matching
  const handleFetchPlaylist = async (url) => {
    console.log('[PAGE] handleFetchPlaylist started with url:', url);
    setIsLoading(true);
    setErrorMessage('');
    setSongs([]);
    setSelectedIds(new Set());
    setPlaylistMeta(null);

    try {
      const fetchUrl = `/api/youtube/playlist?url=${encodeURIComponent(url)}`;
      console.log('[PAGE] Fetching:', fetchUrl);
      const res = await fetch(fetchUrl);
      const data = await res.json();
      console.log('[PAGE] API response received:', data);

      if (!res.ok) {
        throw new Error(data.error || 'Could not load playlist items');
      }

      setPlaylistMeta({
        id: data.playlistId,
        title: data.playlistTitle,
        isDemo: data.isDemo,
      });

      const initialSongs = (data.songs || []).map((s, index) => ({
        ...s,
        id: s.id || `track_${index}`,
        position: index,
        isSearching: true,
        matchedBeatmap: null,
        allMatches: [],
      }));

      setSongs(initialSongs);
      setIsLoading(false);

      // Kick off osu! search for all songs
      searchOsuMatches(initialSongs, mode, statusFilter);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred while loading playlist.');
      setIsLoading(false);
    }
  };

  // Search osu! API for each track in controlled batches
  const searchOsuMatches = async (songsList, currentMode, currentStatus) => {
    if (!songsList || songsList.length === 0) return;
    setIsSearching(true);
    setSearchProgress(0);

    const updated = songsList.map(s => ({
      ...s,
      isSearching: true,
    }));
    setSongs([...updated]);

    let completedCount = 0;
    const newSelected = new Set();
    const concurrency = 3;
    let currentIndex = 0;

    async function searchNext() {
      if (currentIndex >= updated.length) return;
      const index = currentIndex++;
      const song = updated[index];

      try {
        const queryParams = new URLSearchParams({
          q: song.cleanQuery || song.title,
          title: song.extractedTitle || song.title || '',
          artist: song.extractedArtist || song.channelTitle || '',
          mode: currentMode,
          status: currentStatus,
        });

        const extraQueries = [
          ...(song.fallbacks || []),
          ...(song.queries || []),
        ];
        if (extraQueries.length > 0) {
          queryParams.set('fallbacks', JSON.stringify(Array.from(new Set(extraQueries))));
        }

        const res = await fetch(`/api/osu/search?${queryParams.toString()}`);
        const result = await res.json();

        if (result.beatmapsets && result.beatmapsets.length > 0) {
          updated[index] = {
            ...updated[index],
            isSearching: false,
            matchedBeatmap: result.beatmapsets[0],
            allMatches: result.beatmapsets,
          };
          newSelected.add(song.id);
        } else {
          updated[index] = {
            ...updated[index],
            isSearching: false,
            matchedBeatmap: null,
            allMatches: [],
          };
        }
      } catch (err) {
        console.warn(`Search failed for ${song.title}:`, err);
        updated[index] = {
          ...updated[index],
          isSearching: false,
          matchedBeatmap: null,
          allMatches: [],
        };
      }

      completedCount++;
      setSearchProgress(Math.round((completedCount / updated.length) * 100));
      setSongs([...updated]);
      setSelectedIds(new Set(newSelected));

      await searchNext();
    }

    const pool = [];
    for (let i = 0; i < Math.min(concurrency, updated.length); i++) {
      pool.push(searchNext());
    }

    await Promise.all(pool);
    setIsSearching(false);
    osuAudio.playSuccess();
  };

  // Re-search when user changes Mode or Status filter
  const handleModeChange = (newMode) => {
    setMode(newMode);
    if (songs.length > 0) {
      searchOsuMatches(songs, newMode, statusFilter);
    }
  };

  const handleStatusFilterChange = (newStatus) => {
    setStatusFilter(newStatus);
    if (songs.length > 0) {
      searchOsuMatches(songs, mode, newStatus);
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
      setSongs(prev => prev.map(s => s.id === songId ? { ...s, isSearching: false } : s));
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
      const downloadUrl = `/api/download?beatmapsetId=${beatmapId}&title=${encodeURIComponent(song.matchedBeatmap.title)}&artist=${encodeURIComponent(song.matchedBeatmap.artist)}&creator=${encodeURIComponent(song.matchedBeatmap.creator || '')}`;

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `${beatmapId}.osz`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Download error:', e);
    } finally {
      setTimeout(() => {
        setDownloadingIds(prev => {
          const next = new Set(prev);
          next.delete(song.id);
          return next;
        });
      }, 1000);
    }
  };

  // Trigger sequential download for matched songs (or selective)
  const handleDownloadBatch = async () => {
    osuAudio.playClick();
    const matchedSongs = songs.filter(s => s.matchedBeatmap);
    const targetSongs = selectedIds.size > 0
      ? matchedSongs.filter(s => selectedIds.has(s.id))
      : matchedSongs;

    for (let i = 0; i < targetSongs.length; i++) {
      await handleDownloadSingle(targetSongs[i]);
      await new Promise(r => setTimeout(r, 600));
    }
    osuAudio.playSuccess();
  };

  // Download all/selected as a single .zip file
  const handleDownloadZipBatch = async () => {
    osuAudio.playClick();
    const matchedSongs = songs.filter(s => s.matchedBeatmap);
    const targetSongs = selectedIds.size > 0
      ? matchedSongs.filter(s => selectedIds.has(s.id))
      : matchedSongs;

    if (targetSongs.length === 0) return;

    setIsDownloadingZip(true);
    setZipProgress(0);

    const zip = new JSZip();
    let completed = 0;

    for (const song of targetSongs) {
      const bms = song.matchedBeatmap;
      const downloadUrl = `/api/download?beatmapsetId=${bms.id}&title=${encodeURIComponent(bms.title)}&artist=${encodeURIComponent(bms.artist)}&creator=${encodeURIComponent(bms.creator || '')}`;

      try {
        const res = await fetch(downloadUrl);
        if (res.ok) {
          const blob = await res.blob();
          const safeName = `${bms.id} ${bms.artist} - ${bms.title}`.replace(/[/\\?%*:|"<>]/g, '_').trim();
          zip.file(`${safeName}.osz`, blob);
        }
      } catch (err) {
        console.warn(`Failed to zip ${bms.title}:`, err);
      }

      completed++;
      setZipProgress(Math.round((completed / targetSongs.length) * 100));
    }

    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `osu_playlist_bundle_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Play completion fanfare and confetti
      osuAudio.playSuccess();
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#ff66aa', '#3399ff', '#00dd88', '#9944ff'],
      });
    } catch (zipErr) {
      console.error('ZIP error:', zipErr);
    } finally {
      setIsDownloadingZip(false);
      setZipProgress(0);
    }
  };

  // Handle selecting alternative beatmap version
  const handleSelectAlternativeMatch = (songId, selectedBeatmap) => {
    setSongs(prev => prev.map(s => {
      if (s.id === songId) {
        return {
          ...s,
          matchedBeatmap: selectedBeatmap,
        };
      }
      return s;
    }));
  };

  const matchedCount = songs.filter(s => s.matchedBeatmap).length;
  const selectedCount = songs.filter(s => s.matchedBeatmap && selectedIds.has(s.id)).length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#201f27', color: '#ffffff' }}>
      <Navbar
        onOpenSetupGuide={() => setSetupGuideOpen(true)}
        systemStatus={systemStatus}
      />

      <main style={{ flex: 1, padding: '0 16px', background: '#1d1720ff' }}>
        <Hero onTryDemo={() => handleFetchPlaylist('https://www.youtube.com/playlist?list=PLosu_banger_showcase_01')} />

        <PlaylistInput
          onFetch={handleFetchPlaylist}
          isLoading={isLoading}
          mode={mode}
          setMode={handleModeChange}
          statusFilter={statusFilter}
          setStatusFilter={handleStatusFilterChange}
        />

        {/* Error alert banner */}
        {errorMessage && (
          <div style={{
            maxWidth: '1240px',
            margin: '0 auto 14px',
            padding: '10px 16px',
            background: 'rgba(255, 68, 68, 0.15)',
            border: '1px solid rgba(255, 68, 68, 0.4)',
            borderRadius: '6px',
            color: '#ff8a80',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.82rem',
            fontWeight: 700,
          }}>
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Playlist metadata banner */}
        {playlistMeta && (
          <div style={{
            maxWidth: '1240px',
            margin: '0 auto 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 2px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Music2 size={16} color="#ff66aa" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 900, margin: 0, color: '#ffffff' }}>
                {playlistMeta.title}
              </h3>
              {playlistMeta.isDemo && (
                <span style={{
                  background: '#ffcc22',
                  color: '#332700',
                  fontWeight: 800,
                  fontSize: '0.66rem',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  textTransform: 'uppercase',
                  marginLeft: '4px',
                }}>
                  Sample
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stats and Action bar */}
        {songs.length > 0 && (
          <StatsBar
            totalSongs={songs.length}
            matchedCount={matchedCount}
            selectedCount={selectedCount}
            onDownloadAction={handleDownloadBatch}
            onDownloadZipAction={handleDownloadZipBatch}
            isDownloadingZip={isDownloadingZip}
            zipProgress={zipProgress}
            isSearching={isSearching}
            searchProgress={searchProgress}
            onOpenExport={() => setExportModalOpen(true)}
            onClearList={() => {
              setSongs([]);
              setSelectedIds(new Set());
              setPlaylistMeta(null);
            }}
          />
        )}

        {/* Songs Results Table */}
        {songs.length > 0 && (
          <SongTable
            songs={songs}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            onDownloadSingle={handleDownloadSingle}
            downloadingIds={downloadingIds}
            onSelectAlternativeMatch={handleSelectAlternativeMatch}
            onManualSearch={handleManualSearch}
          />
        )}
      </main>

      {/* Setup Guide Modal */}
      <SetupGuideModal
        isOpen={setupGuideOpen}
        onClose={() => setSetupGuideOpen(false)}
      />

      {/* Export Links & Beatmaps Modal */}
      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        songs={songs}
      />
    </div>
  );
}
