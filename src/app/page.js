'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import PlaylistInput from '@/components/PlaylistInput';
import StatsBar from '@/components/StatsBar';
import SongTable from '@/components/SongTable';
import ExportModal from '@/components/ExportModal';
import SetupGuideModal from '@/components/SetupGuideModal';
import PlayerProfile from '@/components/PlayerProfile';
import PlayerResults from '@/components/PlayerResults';
import PlayerSections from '@/components/PlayerSections';
import DownloadToast from '@/components/DownloadToast';
import { GitHubIcon } from '@/components/Icons';
import { Star } from 'lucide-react';
import { osuAudio } from '@/lib/soundEffects';
import { DEFAULT_STRICTNESS } from '@/lib/matchStrictness';
import JSZip from 'jszip';

const REPO_URL = 'https://github.com/sidlikesgrapess/osu-playlist-sync';


const createEmptySections = () => ({
  best: { isOpen: false, allItems: [], total: 0, isLoading: false, error: '', loaded: false },
  most_played: { isOpen: false, allItems: [], total: 0, isLoading: false, error: '', loaded: false },
  favourite: { isOpen: false, allItems: [], total: 0, isLoading: false, error: '', loaded: false },
});

// osu! collections are already beatmapsets, so they slot straight into the
// song shape the table/download machinery expects — pre-matched.
const beatmapToSong = (item, section) => ({
  id: `osu_${item.beatmapset.id}`,
  title: `${item.beatmapset.artist} - ${item.beatmapset.title}`,
  channelTitle: `mapped by ${item.beatmapset.creator}`,
  cleanQuery: item.beatmapset.title,
  thumbnail: item.beatmapset.covers?.list,
  hasSearched: true,
  isSearching: false,
  matchedBeatmap: item.beatmapset,
  allMatches: [item.beatmapset],
  playerMeta: item.meta,
  playerSection: section,
});

// `pageSize` may be the string 'all', so every slice goes through here.
const pageSlice = (list, page, pageSize) => {
  if (pageSize === 'all') return list;
  const start = (page - 1) * pageSize;
  return list.slice(start, start + pageSize);
};

// Fresh object per call — each song needs its own `allMatches` array.
const blankMatchState = () => ({ hasSearched: false, isSearching: false, matchedBeatmap: null, allMatches: [], rejection: null });

const PLATFORM_BADGE = {
  spotify: { color: '#1db954', bg: 'rgba(29, 185, 84, 0.15)', border: 'rgba(29, 185, 84, 0.35)' },
  apple: { color: '#fc3c44', bg: 'rgba(252, 60, 68, 0.15)', border: 'rgba(252, 60, 68, 0.35)' },
  youtube: { color: '#ff4444', bg: 'rgba(255, 51, 51, 0.15)', border: 'rgba(255, 51, 51, 0.35)' },
  query: { color: '#ff66aa', bg: 'rgba(255, 102, 170, 0.15)', border: 'rgba(255, 102, 170, 0.35)' },
};

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
  const [matchThreshold, setMatchThreshold] = useState(DEFAULT_STRICTNESS);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [downloadingIds, setDownloadingIds] = useState(new Set());
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  // Modal states
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);

  // Download completion toasts
  const [toasts, setToasts] = useState([]);

  // osu! player search state
  const [playerResults, setPlayerResults] = useState([]);
  const [playerResultsTotal, setPlayerResultsTotal] = useState(0);
  const [playerResultsPage, setPlayerResultsPage] = useState(1);
  const [playerQuery, setPlayerQuery] = useState('');
  const [playerProfile, setPlayerProfile] = useState(null);
  const [playerSections, setPlayerSections] = useState(createEmptySections);

  // Check system status on mount
  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => setSystemStatus(data))
      .catch(err => console.warn('Could not check system status:', err));
  }, []);

  // Routes a submission to either player search or the playlist/song flow.
  const handleSubmitInput = (value, platform) => {
    const isPlayerInput = platform === 'player' || /osu\.ppy\.sh\/(users|u)\//i.test(value);
    if (isPlayerInput) return handlePlayerSearch(value);
    return handleFetchPlaylist(value, { forceReplace: Boolean(playerProfile) });
  };

  const clearPlayerState = () => {
    setPlayerProfile(null);
    setPlayerResults([]);
    setPlayerResultsTotal(0);
    setPlayerResultsPage(1);
    setPlayerQuery('');
    setPlayerSections(createEmptySections());
  };

  // Search osu! players by name, or resolve a pasted profile link directly.
  const handlePlayerSearch = async (query, page = 1) => {
    setIsLoading(true);
    setErrorMessage('');
    if (page === 1) setPlayerResults([]);
    setPlayerQuery(query);

    // Switching to player search drops any playlist/song results.
    if (page === 1) {
      setSongs([]);
      setSelectedIds(new Set());
      setPlaylistMeta(null);
      setCurrentPage(1);
    }

    try {
      const res = await fetch(`/api/osu/player?q=${encodeURIComponent(query)}&page=${page}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Player search failed');

      if (data.type === 'profile') {
        applyPlayerProfile(data.user);
        return;
      }

      const users = data.users || [];
      setPlayerResults(users);
      setPlayerResultsTotal(data.total || users.length);
      setPlayerResultsPage(page);
      setIsLoading(false);

      if (users.length === 0) {
        setErrorMessage(`No osu! players found for "${query}".`);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred while searching for that player.');
      setIsLoading(false);
    }
  };

  const handlePlayerResultsPageChange = (page) => {
    handlePlayerSearch(playerQuery, page);
  };

  // Switch the app into player mode for a resolved profile.
  const applyPlayerProfile = (profile) => {
    setPlayerProfile(profile);
    setPlayerResults([]);
    setPlayerResultsTotal(0);
    setSongs([]);
    setSelectedIds(new Set());
    setPlaylistMeta(null);
    setErrorMessage('');
    setIsLoading(false);

    const sections = createEmptySections();
    sections.best.total = profile.counts?.best || 0;
    sections.most_played.total = profile.counts?.most_played || 0;
    sections.favourite.total = profile.counts?.favourite || 0;
    sections.best.isOpen = true;
    setPlayerSections(sections);

    loadSection(profile.id, 'best');
  };

  // Fetch a full profile for a user picked from the search results.
  const handleSelectPlayer = async (user) => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await fetch(`/api/osu/player?userId=${user.id}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Could not load that player');
      applyPlayerProfile(data.user);
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred while loading that player.');
      setIsLoading(false);
    }
  };

  // Merge newly loaded beatmaps into the shared song list (deduped by beatmapset).
  const mergeSongs = (incoming) => {
    setSongs(prev => {
      const seen = new Set(prev.map(s => s.id));
      const additions = incoming.filter(s => !seen.has(s.id));
      if (additions.length === 0) return prev;
      return [...prev, ...additions.map((s, i) => ({ ...s, position: prev.length + i }))];
    });
  };

  // Loads one section's window, filtered by the active mode/status tabs.
  const loadSection = async (userId, type, currentMode = mode, currentStatus = statusFilter) => {
    setPlayerSections(prev => ({
      ...prev,
      [type]: { ...prev[type], isLoading: true, error: '' },
    }));

    try {
      const params = new URLSearchParams({
        userId: String(userId),
        type,
        mode: currentMode,
        status: currentStatus,
      });
      const res = await fetch(`/api/osu/player/beatmaps?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Could not load beatmaps');

      const entries = (data.items || []).map(item => beatmapToSong(item, type));

      setPlayerSections(prev => ({
        ...prev,
        [type]: {
          ...prev[type],
          allItems: entries,
          total: entries.length,
          isLoading: false,
          loaded: true,
        },
      }));
      mergeSongs(entries);
    } catch (err) {
      console.error(err);
      setPlayerSections(prev => ({
        ...prev,
        [type]: { ...prev[type], isLoading: false, error: err.message || 'Could not load beatmaps' },
      }));
    }
  };

  // Selects or deselects a whole section's worth of beatmaps at once.
  const handleSelectMany = (ids, shouldSelect) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => shouldSelect ? next.add(id) : next.delete(id));
      return next;
    });
  };

  const handleToggleSection = (type) => {
    const section = playerSections[type];
    const willOpen = !section.isOpen;

    setPlayerSections(prev => ({
      ...prev,
      [type]: { ...prev[type], isOpen: willOpen },
    }));

    if (willOpen && !section.loaded && !section.isLoading && playerProfile) {
      loadSection(playerProfile.id, type);
    }
  };

  // Mode/status tabs changed while browsing a player: drop loaded maps and refetch.
  const reloadPlayerSections = (nextMode, nextStatus) => {
    if (!playerProfile) return;

    setSongs([]);
    setSelectedIds(new Set());
    setPlayerSections(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(type => {
        next[type] = {
          ...next[type],
          allItems: [],
          total: playerProfile.counts?.[type] || 0,
          loaded: false,
          error: '',
        };
      });
      return next;
    });

    Object.entries(playerSections).forEach(([type, section]) => {
      if (section.isOpen) loadSection(playerProfile.id, type, nextMode, nextStatus);
    });
  };

  const handleClearPlayer = () => {
    clearPlayerState();
    setSongs([]);
    setSelectedIds(new Set());
    setErrorMessage('');
    osuAudio.playClick();
  };

  // Handle fetching a YouTube playlist. When songs already exist, new results are
  // appended instead of replacing the current list.
  const handleFetchPlaylist = async (url, { forceReplace = false } = {}) => {
    const isAppending = !forceReplace && songs.length > 0;

    setIsLoading(true);
    setErrorMessage('');
    if (!isAppending) {
      setSongs([]);
      setSelectedIds(new Set());
      setPlaylistMeta(null);
      setCurrentPage(1);
      clearPlayerState();
    }

    try {
      const fetchUrl = `/api/playlist?url=${encodeURIComponent(url)}`;
      const res = await fetch(fetchUrl);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Could not load playlist items');
      }

      if (!isAppending) {
        setPlaylistMeta({
          id: data.playlistId,
          title: data.playlistTitle,
          platform: data.platform,
          isSingleTrack: data.isSingleTrack,
          isDemo: data.isDemo,
        });
      }

      const offset = isAppending ? songs.length : 0;
      const batchTag = Date.now();
      const newSongs = (data.songs || []).map((s, index) => ({
        ...s,
        id: s.id || `track_${batchTag}_${index}`,
        position: offset + index,
        ...blankMatchState(),
      }));

      const combinedSongs = isAppending ? [...songs, ...newSongs] : newSongs;
      setSongs(combinedSongs);
      setIsLoading(false);

      // An append is the one load with nothing to show for itself: the rows land at the
      // bottom of the queue, usually off-screen, and the page does not move. The first
      // playlist needs no toast because it fills the whole table. Nothing is announced for
      // an empty result either -- that means the scrape failed, and the error says so.
      if (isAppending && newSongs.length > 0) {
        const from = data.playlistTitle ? ` from ${data.playlistTitle}` : '';
        pushToast(
          'Added to queue bottom',
          `${newSongs.length} song${newSongs.length === 1 ? '' : 's'}${from} · ${combinedSongs.length} in queue`,
          'queue',
        );
      }

      // Only search whatever page is currently visible — never songs the user
      // can't see yet. Everything else is picked up lazily via pagination.
      const pageForSearch = isAppending ? currentPage : 1;
      const visibleSongs = pageSlice(combinedSongs, pageForSearch, pageSize);
      const unsearchedVisible = visibleSongs.filter(s => !s.hasSearched && !s.isSearching);
      if (unsearchedVisible.length > 0) {
        searchTargetSongs(combinedSongs, unsearchedVisible.map(s => s.id), mode, statusFilter);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || 'Error occurred while loading playlist.');
      setIsLoading(false);
    }
  };

  // Search osu! API for specific target song IDs in controlled batches
  const searchTargetSongs = async (baseSongs, targetIds, currentMode, currentStatus, currentStrictness = matchThreshold) => {
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
          strictness: String(currentStrictness),
          source: targetSong.source || '',
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
            // A result that failed the artist gate is shown but never pre-selected --
            // it must not slip into a bulk download just because it was displayed.
            if (matched && !matched.artistOverride) {
              setSelectedIds(curr => new Set(curr).add(s.id));
            }
            return {
              ...s,
              hasSearched: true,
              isSearching: false,
              matchedBeatmap: matched,
              allMatches: result.beatmapsets || [],
              rejection: result.rejection || null,
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

    const unsearched = pageSlice(songs, newPage, pageSize).filter(s => !s.hasSearched && !s.isSearching);
    if (unsearched.length > 0) {
      searchTargetSongs(songs, unsearched.map(s => s.id), mode, statusFilter);
    }
  };

  // Handle Page Size change
  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setCurrentPage(1);

    if (songs.length === 0) return;
    const unsearched = pageSlice(songs, 1, newSize).filter(s => !s.hasSearched && !s.isSearching);
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

  // Any search-affecting filter change invalidates every existing match: drop
  // them all, then re-search just the page the user is currently looking at.
  const rematchVisiblePage = (nextMode, nextStatus, nextThreshold) => {
    if (songs.length === 0) return;

    const reset = songs.map(s => ({ ...s, ...blankMatchState() }));
    setSongs(reset);
    setSelectedIds(new Set());

    const pageSongs = pageSlice(reset, currentPage, pageSize);
    searchTargetSongs(reset, pageSongs.map(s => s.id), nextMode, nextStatus, nextThreshold);
  };

  // Re-search when user changes Mode or Status filter.
  //
  // Each of these bails when the value did not actually move. That is not a
  // micro-optimisation: rematchVisiblePage throws away every match on the page
  // and re-searches it, so a handler firing with an unchanged value costs a full
  // page of osu! API calls and silently clears the user's selection. The controls
  // cannot promise they only fire on a real change -- see the slider below -- so
  // the promise is kept here, once, for all three.
  const handleModeChange = (newMode) => {
    if (newMode === mode) return;
    setMode(newMode);

    if (playerProfile) {
      reloadPlayerSections(newMode, statusFilter);
      return;
    }
    rematchVisiblePage(newMode, statusFilter, matchThreshold);
  };

  const handleStatusFilterChange = (newStatus) => {
    if (newStatus === statusFilter) return;
    setStatusFilter(newStatus);

    if (playerProfile) {
      reloadPlayerSections(mode, newStatus);
      return;
    }
    rematchVisiblePage(mode, newStatus, matchThreshold);
  };

  // Re-search when the user drags the Match Strictness slider. Player sections
  // aren't affected — their beatmaps are pre-matched, not fuzzy-scored.
  //
  // The equality guard matters most here. The slider commits on key-up so a drag
  // does not re-search at every step, and once it has been touched it holds DOM
  // focus. Alt-tabbing away therefore delivers the key-up for the window switch
  // straight to it, which was re-searching the whole page on every tab change for
  // a value that never moved.
  const handleMatchThresholdChange = (newThreshold) => {
    if (newThreshold === matchThreshold) return;
    setMatchThreshold(newThreshold);
    if (playerProfile) return;
    rematchVisiblePage(mode, statusFilter, newThreshold);
  };

  // Manual query edit & rematch for a single song
  const handleManualSearch = async (songId, customQuery) => {
    setSongs(prev => prev.map(s => s.id === songId ? { ...s, cleanQuery: customQuery, isSearching: true } : s));

    try {
      const queryParams = new URLSearchParams({
        q: customQuery,
        mode,
        status: statusFilter,
        strictness: String(matchThreshold),
      });

      const res = await fetch(`/api/osu/search?${queryParams.toString()}`);
      const result = await res.json();

      setSongs(prev => prev.map(s => {
        if (s.id === songId) {
          const matched = result.beatmapsets && result.beatmapsets.length > 0 ? result.beatmapsets[0] : null;
          if (matched && !matched.artistOverride) {
            setSelectedIds(curr => new Set(curr).add(songId));
          }
          return {
            ...s,
            cleanQuery: customQuery,
            hasSearched: true,
            isSearching: false,
            matchedBeatmap: matched,
            allMatches: result.beatmapsets || [],
            rejection: result.rejection || null,
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

  const pushToast = (title, detail, kind = 'download') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { id, title, detail, kind }]);
  };

  const dismissToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Download a single .osz file. Batch callers pass `silent` so only one toast fires.
  const handleDownloadSingle = async (song, { silent = false } = {}) => {
    if (!song.matchedBeatmap) return false;
    const beatmapId = song.matchedBeatmap.id;

    setDownloadingIds(prev => new Set(prev).add(song.id));

    try {
      const downloadUrl = `/api/download?beatmapsetId=${beatmapId}`;
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const filename = `${beatmapId} ${song.matchedBeatmap.artist} - ${song.matchedBeatmap.title}.osz`.replace(/[\\/*?:"<>|]/g, '_');
      downloadBlob(blob, filename);
      osuAudio.playSuccess();

      if (!silent) {
        pushToast('Download completed', `${song.matchedBeatmap.artist} - ${song.matchedBeatmap.title}`);
      }
      return true;
    } catch (err) {
      console.error(`Download failed for mapset ${beatmapId}:`, err);
      // Fallback: direct browser link
      window.open(`https://catboy.best/d/${beatmapId}`, '_blank');
      return false;
    } finally {
      setDownloadingIds(prev => {
        const next = new Set(prev);
        next.delete(song.id);
        return next;
      });
    }
  };

  // Only ticked beatmaps are ever downloaded.
  const getSelectedSongs = () => songs.filter(s => selectedIds.has(s.id) && s.matchedBeatmap);

  // Download batch sequentially
  const handleDownloadBatch = async () => {
    const targetSongs = getSelectedSongs();

    if (targetSongs.length === 0) return;

    let completed = 0;
    for (const song of targetSongs) {
      if (await handleDownloadSingle(song, { silent: true })) completed++;
      await new Promise(r => setTimeout(r, 600));
    }

    if (completed > 0) {
      pushToast('Download completed', `${completed} beatmap${completed === 1 ? '' : 's'}`);
    }
  };

  // Bundle as .ZIP
  const handleDownloadZipBatch = async () => {
    const targetSongs = getSelectedSongs();

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
          const downloadUrl = `/api/download?beatmapsetId=${beatmapId}`;
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
      const baseTitle = playerProfile
        ? `${playerProfile.username}_osu_maps`
        : playlistMeta?.title || 'osu_playlist_sync';
      const safeTitle = baseTitle.replace(/[\\/*?:"<>|]/g, '_');
      downloadBlob(zipContent, `${safeTitle}_beatmaps.zip`);

      osuAudio.playSuccess();
      pushToast('Download completed', `ZIP bundle · ${targetSongs.length} beatmap${targetSongs.length === 1 ? '' : 's'}`);
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

  const platformBadge = PLATFORM_BADGE[playlistMeta?.platform] || PLATFORM_BADGE.query;

  const matchedCount = songs.filter(s => s.matchedBeatmap).length;
  const searchedCount = songs.filter(s => s.hasSearched).length;
  const unsearchedCount = songs.filter(s => !s.hasSearched).length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Sticky Frosted Glass Header */}
      <Navbar onOpenSetupGuide={() => setIsSetupOpen(true)} />

      {/* Main Content */}
      <main style={{ flex: 1, padding: '0 16px 40px' }}>
        {/* Dynamic Hero Section */}
        <Hero />

        {/* Liquid Glass Search & Filter Dock */}
        <PlaylistInput
          onFetch={handleSubmitInput}
          isLoading={isLoading}
          hasSongs={!playerProfile && songs.length > 0}
          mode={mode}
          setMode={handleModeChange}
          statusFilter={statusFilter}
          setStatusFilter={handleStatusFilterChange}
          matchThreshold={matchThreshold}
          setMatchThreshold={handleMatchThresholdChange}
        />

        {/* Error Notification */}
        {errorMessage && (
          <div style={{
            maxWidth: '1240px',
            margin: '0 auto 16px',
            background: 'rgba(255, 68, 68, 0.12)',
            border: '1px solid rgba(255, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '12px 18px',
            color: '#ff8888',
            fontSize: '0.86rem',
            fontWeight: 700,
          }}>
            {errorMessage}
          </div>
        )}

        {/* osu! Player Search Results */}
        {!playerProfile && playerResults.length > 0 && (
          <PlayerResults
            users={playerResults}
            total={playerResultsTotal}
            page={playerResultsPage}
            onPageChange={handlePlayerResultsPageChange}
            onSelect={handleSelectPlayer}
            isLoading={isLoading}
          />
        )}

        {/* osu! Player View */}
        {playerProfile && (
          <>
            <PlayerProfile player={playerProfile} onClear={handleClearPlayer} />

            <StatsBar
              totalSongs={songs.length}
              totalLabel="Beatmaps Loaded"
              matchedCount={matchedCount}
              searchedCount={searchedCount}
              selectedCount={selectedIds.size}
              onDownloadAction={handleDownloadBatch}
              onDownloadZipAction={handleDownloadZipBatch}
              isDownloadingZip={isDownloadingZip}
              zipProgress={zipProgress}
              isSearching={false}
              searchProgress={0}
              unsearchedCount={0}
              onOpenExport={() => setIsExportOpen(true)}
              onClearList={handleClearPlayer}
            />

            <PlayerSections
              sections={playerSections}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onSelectMany={handleSelectMany}
              onToggleSection={handleToggleSection}
              onDownloadSingle={handleDownloadSingle}
              downloadingIds={downloadingIds}
            />
          </>
        )}

        {/* Playlist Content View */}
        {!playerProfile && songs.length > 0 && (
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
                    background: platformBadge.bg,
                    color: platformBadge.color,
                    border: `1px solid ${platformBadge.border}`,
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
              unsearchedCount={unsearchedCount}
              onSearchAllRemaining={handleSearchAllRemaining}
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

      {/* Footer: GitHub link + star nudge */}
      <footer style={{
        padding: '18px 16px 28px',
        display: 'flex',
        justifyContent: 'center',
      }}>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onMouseEnter={() => osuAudio.playHover()}
          onClick={() => osuAudio.playClick()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: '#6b6376',
            fontSize: '0.72rem',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          <GitHubIcon size={13} color="#6b6376" />
          <span>GitHub</span>
          <span style={{ color: '#3d3846' }}>·</span>
          <Star size={12} color="#ffbb22" style={{ fill: '#ffbb22' }} />
          <span>Consider starring this project</span>
        </a>
      </footer>

      {/* Download completion toasts */}
      <DownloadToast toasts={toasts} onDismiss={dismissToast} />

      {/* Export Links Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        songs={songs}
      />

      {/* End-User Guide & System Status Modal */}
      <SetupGuideModal
        isOpen={isSetupOpen}
        onClose={() => setIsSetupOpen(false)}
        systemStatus={systemStatus}
      />
    </div>
  );
}
