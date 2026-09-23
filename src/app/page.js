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
import { isRankedStatus } from '@/lib/beatmapFormat';
import {
  fetchBeatmapArchive,
  createProxyBudget,
  createPacer,
  isAbortError,
  shouldStartNewPart,
} from '@/lib/beatmapDownload';
import { osuFilename, sanitizeStem } from '@/lib/filename';
import { beatmapsetPage } from '@/lib/mirrors';
import { mergeSongs as mergeSongLists } from '@/lib/song';

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

// How long an object URL outlives its click. Revoking it synchronously can cancel
// the save before the browser has started reading the blob (Safari and Firefox do).
const REVOKE_DELAY_MS = 10_000;

function downloadBlob(blob, filename) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
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
  // The strictness the matches currently on screen were searched at. It trails
  // `matchThreshold` whenever the slider has moved but Refetch has not been pressed,
  // and that gap is the only thing that enables the button.
  const [appliedStrictness, setAppliedStrictness] = useState(DEFAULT_STRICTNESS);
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

      if (data.isDemo) {
        setErrorMessage('Player search needs osu! API credentials.');
        setIsSetupOpen(true);
        setIsLoading(false);
        return;
      }

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
      const res = await fetch(`/api/osu/player?userId=${encodeURIComponent(user.id)}`);
      const data = await res.json();

      if (data.isDemo) {
        setErrorMessage('Player search needs osu! API credentials.');
        setIsSetupOpen(true);
        setIsLoading(false);
        return;
      }

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
          returnedCount: data.returnedCount,
          loadedCount: data.loadedCount,
          unavailableCount: data.unavailableCount,
          truncated: data.truncated,
          playlistLength: data.playlistLength,
        });
      }

      // page.js is the one place a song id is made: a provider id when there is one, else a
      // per batch placeholder that songKey knows not to trust, so the row is deduped on its
      // title and artist instead.
      const batchTag = Date.now();
      const fetched = (data.songs || []).map((s, index) => ({
        ...s,
        id: s.id || `track_${batchTag}_${index}`,
        ...blankMatchState(),
      }));

      // Every load goes through the same identity rule (songKey in song.js). An append never
      // repeats a song already in the queue, and a playlist that lists one video twice keeps
      // one row, so two rows can never share a React key. Existing rows win, keeping their
      // matches and selection, and positions are given to the additions only.
      const { songs: combinedSongs, added, skipped } = mergeSongLists(isAppending ? songs : [], fetched);
      setSongs(combinedSongs);
      setIsLoading(false);

      // An append is the one load with nothing to show for itself: the rows land at the
      // bottom of the queue, usually off-screen, and the page does not move. The first
      // playlist needs no toast because it fills the whole table. An append where every song
      // was already queued still says so, since otherwise nothing at all would happen.
      const unavailable = data.unavailableCount || 0;
      if (isAppending && (added > 0 || skipped > 0 || unavailable > 0)) {
        const from = data.playlistTitle ? ` from ${data.playlistTitle}` : '';
        const parts = [`Added ${added} song${added === 1 ? '' : 's'}${from}`];
        if (skipped > 0) parts.push(`${skipped} ${skipped === 1 ? 'was' : 'were'} already in the queue`);
        if (unavailable > 0) parts.push(`${unavailable} ${unavailable === 1 ? 'is' : 'are'} unavailable on YouTube`);
        pushToast(
          added > 0 ? 'Added to queue bottom' : 'Nothing new to add',
          parts.join(' · '),
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
  const searchTargetSongs = async (baseSongs, targetIds, currentMode, currentStatus, explicitStrictness = null) => {
    if (!targetIds || targetIds.length === 0) return;
    const targetSet = new Set(targetIds);

    // Which strictness these rows get searched at.
    //
    // Only Refetch names one. Everything else is filling in rows the user has not seen
    // yet (a new page, an appended playlist, Search All), and those must agree with the
    // rows already on screen, not with wherever the slider happens to be sitting: moving
    // it and then paging would otherwise leave one table holding two strictnesses with
    // nothing to tell them apart. With nothing searched yet there is nothing to agree
    // with, so the slider wins and the number on it is honest for the next playlist.
    const basis = baseSongs || songs;
    const currentStrictness = explicitStrictness ?? (
      basis.some(s => s.hasSearched) ? appliedStrictness : matchThreshold
    );

    // Every search funnels through here, so this is the one place that can honestly
    // say what strictness the visible matches were produced at.
    setAppliedStrictness(currentStrictness);
    setIsSearching(true);
    setSearchProgress(0);

    // Mark targets as searching
    let updated = basis.map(s => {
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
        if (targetSong.artistFromTitle) queryParams.set('artistFromTitle', '1');

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

  // Re-pick every searched song's match from the candidates it already holds.
  //
  // Only correct when the new status filter accepts a subset of the old one, so
  // `allMatches` is guaranteed to contain the new answer somewhere in it. It is
  // already sorted by score, so the best survivor is simply the first one left.
  const narrowMatchesToRanked = () => {
    const narrowed = songs.map(song => {
      if (!song.hasSearched) return song;

      const matches = song.allMatches || [];
      const kept = matches.filter(set => isRankedStatus(set.status));
      if (kept.length === matches.length) return song;

      return {
        ...song,
        allMatches: kept,
        matchedBeatmap: kept[0] || null,
        // Losing every candidate to the filter is not the same as never finding one,
        // and saying so would point the user at the wrong control.
        rejection: kept.length === 0 ? { kind: 'status-filtered' } : song.rejection,
      };
    });

    setSongs(narrowed);

    // Selections survive the narrowing unless what they pointed at did not. A song
    // whose new best candidate is artist-flagged is dropped for the same reason one
    // is never auto-selected: it must not ride along in a bulk download.
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const song of narrowed) {
        if (!next.has(song.id)) continue;
        if (!song.matchedBeatmap || song.matchedBeatmap.artistOverride) next.delete(song.id);
      }
      return next;
    });
  };

  // True only where the new filter accepts a subset of what the old one did. With two
  // filters that is a single transition, and anything else has to go back to osu!.
  const isNarrowing = (from, to) => from === 'any' && to === 'ranked';

  const handleStatusFilterChange = (newStatus) => {
    if (newStatus === statusFilter) return;
    setStatusFilter(newStatus);

    if (playerProfile) {
      reloadPlayerSections(mode, newStatus);
      return;
    }

    // Narrowing costs nothing: the wider search already returned these candidates and
    // every one carries its status. Widening cannot be done locally at all, because
    // `s=ranked` goes to the osu! API itself, so the unranked sets were never fetched.
    // A search still in flight is left to refetch too, since its results were asked
    // for under the old filter and would land unfiltered after this returns.
    if (isNarrowing(statusFilter, newStatus) && !isSearching) {
      narrowMatchesToRanked();
      return;
    }

    rematchVisiblePage(mode, newStatus, matchThreshold);
  };

  // Moving the Match Strictness slider only changes the setting. It never searches.
  //
  // Dragging it used to commit on mouse-up, which made every exploratory nudge cost a
  // full page of osu! API calls and silently clear the selection. Worse, the slider
  // keeps DOM focus once touched, so the key-up from an alt-tab landed on it and
  // re-searched the page for a value that had not moved. Both problems were really the
  // same one: the control decided when to spend calls, and it had no way of knowing
  // whether the user was done. Refetch below is the user saying so.
  //
  // The new value still applies to any *fresh* search immediately, so the number on the
  // slider is never a lie about what the next playlist will be matched at.
  const handleMatchThresholdChange = (newThreshold) => {
    setMatchThreshold(newThreshold);
  };

  // Spend the calls, now that the user has asked for it. Player sections are excluded
  // for the same reason they always were: their beatmaps are pre-matched, not scored.
  const handleStrictnessRefetch = () => {
    if (playerProfile || matchThreshold === appliedStrictness) return;
    rematchVisiblePage(mode, statusFilter, matchThreshold);
  };

  // The slider has moved away from what the visible matches were built with, and there
  // is something on screen worth rebuilding. Held here rather than in the component
  // because only page.js knows whether a search is already running.
  const canRefetchStrictness =
    !playerProfile &&
    songs.length > 0 &&
    !isSearching &&
    !isLoading &&
    matchThreshold !== appliedStrictness;

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

  // One batch (Download or ZIP) at a time. The ref is what stops a double click:
  // the state would still read false on the second click, before React re-renders.
  // The state is what the StatsBar buttons key on.
  const batchInFlightRef = useRef(false);
  const batchAbortRef = useRef(null);
  const [isBatchActive, setIsBatchActive] = useState(false);

  // One proxy allowance for the whole page session, not a fresh one per batch, so
  // back to back batches during a mirror outage cannot each proxy their own share.
  const proxyBudgetRef = useRef(null);
  const sessionProxyBudget = () => {
    if (!proxyBudgetRef.current) proxyBudgetRef.current = createProxyBudget();
    return proxyBudgetRef.current;
  };

  // Returns the batch's AbortController, or null when a batch is already running.
  const beginBatch = () => {
    if (batchInFlightRef.current) return null;
    batchInFlightRef.current = true;
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setIsBatchActive(true);
    return controller;
  };

  const endBatch = (controller) => {
    if (batchAbortRef.current !== controller) return;
    batchAbortRef.current = null;
    batchInFlightRef.current = false;
    setIsBatchActive(false);
  };

  // The loops check the signal between items; an archive mid fetch is aborted too,
  // and a cancelled item never falls back to the proxy.
  const handleCancelBatch = () => {
    batchAbortRef.current?.abort();
  };

  // Download a single .osz file. Batch callers pass `silent` so only one toast
  // fires, the session `budget` so a batch cannot fall back to the proxy without
  // limit, and their `pacer` and `signal`.
  const handleDownloadSingle = async (song, { silent = false, budget = null, pacer = null, signal = null } = {}) => {
    if (!song.matchedBeatmap) return false;
    const { id: beatmapId, artist, title } = song.matchedBeatmap;

    setDownloadingIds(prev => new Set(prev).add(song.id));

    try {
      const result = await fetchBeatmapArchive(beatmapId, { budget, pacer, signal });
      if (!result) throw new Error('Download failed');

      downloadBlob(result.blob, osuFilename(beatmapId, artist, title));
      osuAudio.playSuccess();

      if (!silent) {
        pushToast('Download completed', `${artist} - ${title}`);
      }
      return true;
    } catch (err) {
      if (isAbortError(err)) return false;
      console.error(`Download failed for mapset ${beatmapId}:`, err);
      // Last resort: the map's osu! page, never a mirror that has just failed. Only
      // for a single click: in a batch every failure would open its own tab, and an
      // outage fails most of the batch. The batch reports its skipped maps in one
      // toast instead.
      if (!silent) {
        window.open(beatmapsetPage(beatmapId), '_blank');
        pushToast('Download failed', 'No mirror could send this map right now, so its osu! page is open instead.');
      }
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

  const pushCancelledToast = (saved, total) => {
    pushToast('Download cancelled', `${saved} of ${total} saved.`);
  };

  // Download batch sequentially
  const handleDownloadBatch = async () => {
    const targetSongs = getSelectedSongs();

    if (targetSongs.length === 0) return;

    const controller = beginBatch();
    if (!controller) return;
    const { signal } = controller;
    const budget = sessionProxyBudget();
    // The bytes come from volunteer-run mirrors, so the loop paces itself.
    const pacer = createPacer();
    let completed = 0;

    try {
      for (let i = 0; i < targetSongs.length; i++) {
        if (i > 0) await pacer.wait(signal);
        if (signal.aborted) break;
        if (await handleDownloadSingle(targetSongs[i], { silent: true, budget, pacer, signal })) completed++;
      }
    } finally {
      endBatch(controller);
    }

    if (signal.aborted) {
      pushCancelledToast(completed, targetSongs.length);
      return;
    }
    if (completed > 0) {
      pushToast('Download completed', `${completed} beatmap${completed === 1 ? '' : 's'}`);
    }
    if (completed < targetSongs.length) {
      pushToast(
        'Some beatmaps were skipped',
        `${targetSongs.length - completed} could not be fetched. The mirrors may be busy, so try again shortly.`,
      );
    }
  };

  // Bundle as .ZIP, in parts of at most MAX_ZIP_PART_BYTES. JSZip holds a part's
  // inputs and its output at once, so the part cap is the only bound on memory.
  const handleDownloadZipBatch = async () => {
    const targetSongs = getSelectedSongs();

    if (targetSongs.length === 0) return;

    const controller = beginBatch();
    if (!controller) return;
    const { signal } = controller;

    setIsDownloadingZip(true);
    setZipProgress(0);
    const budget = sessionProxyBudget();
    const pacer = createPacer();
    const baseTitle = playerProfile
      ? `${playerProfile.username}_osu_maps`
      : playlistMeta?.title || 'osu_playlist_sync';
    let added = 0;

    try {
      const { default: JSZip } = await import('jszip');
      let zip = new JSZip();
      let partBytes = 0;
      let partCount = 0;
      let partsSaved = 0;

      // Generates and saves the current part, then drops it so its blobs can be freed.
      const savePart = async (filename) => {
        const content = await zip.generateAsync({ type: 'blob' });
        downloadBlob(content, filename);
        partsSaved++;
        zip = new JSZip();
        partBytes = 0;
        partCount = 0;
      };

      for (let i = 0; i < targetSongs.length; i++) {
        if (i > 0) await pacer.wait(signal);
        if (signal.aborted) break;

        const { id: beatmapId, artist, title } = targetSongs[i].matchedBeatmap;
        const filename = osuFilename(beatmapId, artist, title);

        try {
          const result = await fetchBeatmapArchive(beatmapId, { budget, pacer, signal });
          if (result) {
            // Nothing more is fetched until the full part has been saved and released.
            if (shouldStartNewPart(partBytes, partCount, result.blob.size)) {
              await savePart(`osuSync-part-${partsSaved + 1}.zip`);
            }
            zip.file(filename, result.blob);
            partBytes += result.blob.size;
            partCount++;
            added++;
          }
        } catch (e) {
          if (isAbortError(e)) break;
          console.warn(`Could not add ${filename} to zip:`, e);
        }

        setZipProgress(Math.round(((i + 1) / targetSongs.length) * 100));
      }

      // A cancelled bundle still saves what it already fetched, rather than asking the
      // mirrors for the same maps again next time.
      if (partCount > 0) {
        await savePart(partsSaved > 0 ? `osuSync-part-${partsSaved + 1}.zip` : `${sanitizeStem(baseTitle)}_beatmaps.zip`);
      }

      if (signal.aborted) {
        pushCancelledToast(added, targetSongs.length);
        return;
      }
      if (added === 0) {
        pushToast('Nothing to bundle', 'No beatmap could be fetched. The mirrors may be busy, so try again shortly.');
        return;
      }

      osuAudio.playSuccess();
      const partsNote = partsSaved > 1 ? ` in ${partsSaved} parts` : '';
      pushToast('Download completed', `ZIP bundle · ${added} beatmap${added === 1 ? '' : 's'}${partsNote}`);
    } catch (err) {
      console.error('ZIP generation failed:', err);
      pushToast(
        'Could not build the ZIP',
        `${added} beatmap${added === 1 ? ' was' : 's were'} fetched but the bundle could not be saved. Try fewer at once.`,
      );
    } finally {
      setIsDownloadingZip(false);
      endBatch(controller);
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
          canRefetchStrictness={canRefetchStrictness}
          onStrictnessRefetch={handleStrictnessRefetch}
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
