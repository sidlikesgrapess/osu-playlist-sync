/**
 * osu! API v2 client and beatmap search helper.
 * Handles OAuth2 Client Credentials grant and querying beatmapsets.
 */

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get an osu! API v2 access token using Client Credentials.
 */
export async function getOsuAccessToken() {
  const clientId = process.env.OSU_CLIENT_ID;
  const clientSecret = process.env.OSU_CLIENT_SECRET;

  if (!clientId || !clientSecret || clientId === 'your_osu_client_id_here') {
    return null;
  }

  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  try {
    const response = await fetch('https://osu.ppy.sh/oauth/token', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'public',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[osu! API] Auth failed:', response.status, errText);
      return null;
    }

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in * 1000);
    return cachedToken;
  } catch (error) {
    console.error('[osu! API] Token request exception:', error);
    return null;
  }
}

const OSU_API_BASE = 'https://osu.ppy.sh/api/v2';

/**
 * Authenticated GET against the osu! API v2. Throws with `.status` so callers
 * can distinguish rate limits (429) from genuine misses.
 */
async function osuApiGet(path, token) {
  const res = await fetch(`${OSU_API_BASE}${path}`, {
    cache: 'no-store',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    const error = new Error(`osu! API responded ${res.status} for ${path}`);
    error.status = res.status;
    error.retryAfter = res.headers.get('retry-after');
    throw error;
  }

  return res.json();
}

/**
 * Extracts the user reference (id or username) out of an osu! profile URL.
 * Returns null when the input isn't a profile link.
 */
export function parseOsuProfileRef(input = '') {
  const match = String(input).trim().match(/osu\.ppy\.sh\/(?:users|u)\/([^/?#\s]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}

function formatUserSummary(user) {
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatar_url,
    countryCode: user.country_code || user.country?.code || null,
    isSupporter: Boolean(user.is_supporter),
  };
}

function formatUserProfile(user) {
  const stats = user.statistics || {};
  return {
    ...formatUserSummary(user),
    coverUrl: user.cover?.custom_url || user.cover?.url || user.cover_url || null,
    globalRank: stats.global_rank || null,
    countryRank: stats.country_rank || null,
    pp: stats.pp ? Math.round(stats.pp) : null,
    playCount: stats.play_count || 0,
    counts: {
      // /scores/best only ever exposes the top 100 plays
      best: Math.min(user.scores_best_count ?? 100, 100),
      most_played: user.beatmap_playcounts_count ?? 0,
      favourite: user.favourite_beatmapset_count ?? 0,
    },
  };
}

/**
 * Search osu! users by name. The API pages in fixed windows of 20 via `page`.
 */
export async function searchOsuUsers(query, page = 1) {
  const token = await getOsuAccessToken();
  if (!token) return { users: [], isDemo: true };

  const data = await osuApiGet(`/search?query=${encodeURIComponent(query)}&mode=user&page=${page}`, token);
  const users = data?.user?.data || [];

  return { users: users.map(formatUserSummary), total: data?.user?.total || users.length };
}

/**
 * Fetch a single osu! user profile by numeric id or username.
 */
export async function getOsuUser(userRef) {
  const token = await getOsuAccessToken();
  if (!token) return null;

  const ref = String(userRef).trim();
  const path = /^\d+$/.test(ref)
    ? `/users/${encodeURIComponent(ref)}`
    : `/users/${encodeURIComponent(ref)}?key=username`;

  return formatUserProfile(await osuApiGet(path, token));
}

/**
 * Normalizes one entry from a user's best scores / most played / favourites
 * into a common `{ beatmapset, meta }` shape.
 */
function normalizeUserBeatmapEntry(entry, type) {
  let set = null;
  let beatmap = null;
  let meta = {};

  if (type === 'best') {
    set = entry.beatmapset;
    beatmap = entry.beatmap;
    meta = {
      pp: typeof entry.pp === 'number' ? Math.round(entry.pp) : null,
      rank: entry.rank || null,
      accuracy: typeof entry.accuracy === 'number' ? Number((entry.accuracy * 100).toFixed(2)) : null,
      mods: (entry.mods || []).map(m => (typeof m === 'string' ? m : m?.acronym)).filter(Boolean),
    };
  } else if (type === 'most_played') {
    set = entry.beatmapset;
    beatmap = entry.beatmap;
    meta = { playCount: entry.count || 0 };
  } else {
    set = entry;
  }

  if (!set || !set.id) return null;

  // Compact sets from score/playcount endpoints carry no difficulty list —
  // fall back to the single beatmap the entry refers to.
  const withDifficulties = (!set.beatmaps || set.beatmaps.length === 0) && beatmap
    ? { ...set, beatmaps: [beatmap] }
    : set;

  return { beatmapset: formatBeatmapset(withDifficulties), meta };
}

/**
 * The `best` and `most_played` endpoints return one entry per *difficulty*, so a
 * set the player has several scores or playcounts on comes back several times.
 * Everything downstream — selection, export, download — is keyed by beatmapset,
 * so those rows are indistinguishable duplicates: collapse them into one entry
 * that keeps the strongest score and every difficulty the player touched.
 */
function dedupeByBeatmapset(entries) {
  const byId = new Map();

  entries.forEach(entry => {
    const existing = byId.get(entry.beatmapset.id);
    byId.set(entry.beatmapset.id, existing ? mergeBeatmapsetEntries(existing, entry) : entry);
  });

  return [...byId.values()];
}

function mergeBeatmapsetEntries(a, b) {
  // The higher-pp score wins the row (rank badge, accuracy, mods); playcounts
  // are per-difficulty, so they add up to the player's total on the set.
  const primary = (b.meta?.pp || 0) > (a.meta?.pp || 0) ? b : a;
  const other = primary === a ? b : a;

  const difficulties = [...(primary.beatmapset.difficulties || [])];
  const seenDiffs = new Set(difficulties.map(d => d.id));
  (other.beatmapset.difficulties || []).forEach(d => {
    if (!seenDiffs.has(d.id)) {
      seenDiffs.add(d.id);
      difficulties.push(d);
    }
  });
  difficulties.sort((x, y) => x.difficultyRating - y.difficultyRating);

  const playCount = (a.meta?.playCount || 0) + (b.meta?.playCount || 0);

  return {
    beatmapset: {
      ...primary.beatmapset,
      difficulties,
      starRange: difficulties.length > 0
        ? { min: difficulties[0].difficultyRating, max: difficulties[difficulties.length - 1].difficultyRating }
        : primary.beatmapset.starRange,
    },
    meta: {
      ...primary.meta,
      ...(playCount > 0 ? { playCount } : {}),
    },
  };
}

const RANKED_STATUSES = ['ranked', 'loved', 'qualified', 'approved'];

/**
 * Applies the UI's mode / status filters to a normalized beatmapset.
 * osu! only supports a mode filter natively on score endpoints, so the
 * collection endpoints are filtered here instead.
 */
function matchesCollectionFilters(beatmapset, mode, status) {
  if (status === 'ranked' && !RANKED_STATUSES.includes(beatmapset.status)) {
    return false;
  }

  if (mode && mode !== 'all') {
    const modes = (beatmapset.difficulties || []).map(d => d.mode).filter(Boolean);
    if (modes.length > 0 && !modes.includes(mode)) return false;
  }

  return true;
}

/**
 * Fetch a window of a user's best performances, most played maps, or favourites.
 *
 * Filtering has to happen after the fetch for the collection endpoints, so we
 * pull one larger window per section and let the caller paginate locally —
 * that keeps page counts honest and costs one API call instead of one per page.
 */
export async function getUserBeatmapCollection(userId, type, { limit = 100, mode = 'all', status = 'any' } = {}) {
  const token = await getOsuAccessToken();
  if (!token) return { items: [], isDemo: true };

  // Only the score endpoints accept a ruleset filter directly.
  const modeParam = type === 'best' && mode && mode !== 'all' ? `&mode=${encodeURIComponent(mode)}` : '';

  const pathByType = {
    best: `/users/${userId}/scores/best?limit=${limit}&offset=0${modeParam}`,
    most_played: `/users/${userId}/beatmapsets/most_played?limit=${limit}&offset=0`,
    favourite: `/users/${userId}/beatmapsets/favourite?limit=${limit}&offset=0`,
  };

  const path = pathByType[type];
  if (!path) throw new Error(`Unknown collection type: ${type}`);

  const data = await osuApiGet(path, token);
  const list = Array.isArray(data) ? data : [];

  const normalized = list.map(entry => normalizeUserBeatmapEntry(entry, type)).filter(Boolean);
  const filtered = normalized.filter(item => matchesCollectionFilters(item.beatmapset, mode, status));
  // Dedupe after filtering: the mode filter reads per-difficulty modes, which a
  // merged entry would blur together.
  const items = dedupeByBeatmapset(filtered);

  return { items, fetched: normalized.length };
}

/**
 * Normalizes strings for loose comparison (removes punctuation, prefixes like 'the', and extra spaces)
 */
function normalizeForComparison(str = '') {
  return str
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score how well an osu! beatmapset matches the target song title & artist.
 * Returns a score between -100 and 200+.
 */
export function scoreBeatmapMatch(beatmap, targetTitle = '', targetArtist = '') {
  let score = 0;
  const bmTitle = normalizeForComparison(beatmap.title || '');
  const bmArtist = normalizeForComparison(beatmap.artist || '');
  const tTitle = normalizeForComparison(targetTitle || '');
  const tArtist = normalizeForComparison(targetArtist || '');

  // 1. Title matching
  const isExactTitle = bmTitle === tTitle;
  const isTitleContained = (tTitle && bmTitle.includes(tTitle)) || (bmTitle && tTitle.includes(bmTitle));

  if (isExactTitle) {
    score += 100;
  } else if (isTitleContained && tTitle) {
    const lenRatio = Math.min(bmTitle.length, tTitle.length) / Math.max(bmTitle.length, tTitle.length);
    score += 60 * lenRatio;
  } else {
    // No title overlap at all
    score -= 60;
  }

  // 2. Artist matching
  let isArtistMatch = false;

  if (tArtist && bmArtist) {
    if (bmArtist === tArtist || bmArtist.includes(tArtist) || tArtist.includes(bmArtist)) {
      score += 100;
      isArtistMatch = true;
    }
  }

  // If artist does not match:
  // - If title is exact, apply mild penalty (-25) so channel name differences don't drop exact song matches
  // - If title is only partial or fuzzy, apply heavy penalty (-80)
  if (tArtist && !isArtistMatch) {
    score -= isExactTitle ? 25 : 80;
  }

  // Bonus for ranked or loved maps
  if (beatmap.status === 'ranked' || beatmap.status === 'loved') {
    score += 15;
  }

  return score;
}

/**
 * Search beatmapsets on osu! API v2 with smart fallbacks, mode filtering, and strict status filtering.
 */
export async function searchOsuBeatmaps(query, options = {}) {
  const token = await getOsuAccessToken();

  if (!token) {
    return { beatmapsets: [], total: 0, isDemo: true };
  }

  const targetTitle = options.title || query;
  const targetArtist = options.artist || '';

  const queriesToRun = Array.from(
    new Set([
      targetArtist && targetTitle ? `${targetArtist} ${targetTitle}`.trim() : null,
      query,
      ...(options.queries || []),
      targetTitle,
    ].filter(Boolean))
  );

  const modeMap = { osu: '0', taiko: '1', fruits: '2', mania: '3' };
  const modeParam = options.mode && modeMap[options.mode] ? modeMap[options.mode] : null;

  // Handle status parameter: 'ranked' means ranked/loved/qualified only. 'any' means everything.
  const statusFilter = options.status || 'any';
  const isRankedOnly = statusFilter === 'ranked';

  let allFoundSets = [];
  let bestScore = -100;

  for (const q of queriesToRun) {
    const searchPath = `/beatmapsets/search?q=${encodeURIComponent(q)}&sort=relevance_desc${modeParam ? `&m=${modeParam}` : ''}&s=${isRankedOnly ? 'ranked' : 'any'}`;

    try {
      const res = await fetch(`${OSU_API_BASE}${searchPath}`, {
        cache: 'no-store',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        console.warn(`[osu! Search] ${res.status} for query "${q}"${res.status === 429 ? ' (rate limited)' : ''}`);
      }

      if (res.ok) {
        const data = await res.json();
        let sets = data.beatmapsets || [];

        if (isRankedOnly) {
          sets = sets.filter(bm => bm.status === 'ranked' || bm.status === 'loved' || bm.status === 'qualified');
        }

        for (const bm of sets) {
          const score = scoreBeatmapMatch(bm, targetTitle, targetArtist);
          if (!allFoundSets.some(existing => existing.id === bm.id)) {
            allFoundSets.push({ ...bm, _score: score });
          }
          if (score > bestScore) {
            bestScore = score;
          }
        }

        // If we found a definitive exact match (score >= 150), stop searching queries
        if (bestScore >= 150) break;
      }
    } catch (e) {
      console.warn(`[osu! Search] Error searching query "${q}":`, e);
    }
  }

  // Sort candidate mapsets by match score descending
  allFoundSets.sort((a, b) => (b._score || 0) - (a._score || 0));

  // Minimum threshold: user-adjustable via the Match Strictness slider, 70 by default.
  const minThreshold = typeof options.minScore === 'number' && !Number.isNaN(options.minScore)
    ? options.minScore
    : 70;
  const filteredSets = allFoundSets.filter(s => (s._score || 0) >= minThreshold);

  const formatted = filteredSets.map(s => ({ ...formatBeatmapset(s), matchScore: s._score }));

  return {
    beatmapsets: formatted,
    total: formatted.length,
    bestScore: bestScore >= minThreshold ? bestScore : 0,
  };
}

/**
 * Normalizes beatmapset object for frontend consumption.
 */
function formatBeatmapset(set) {
  const diffs = (set.beatmaps || []).map(b => ({
    id: b.id,
    difficultyRating: b.difficulty_rating,
    version: b.version,
    mode: b.mode,
    bpm: b.bpm,
    totalLength: b.total_length,
    circleSize: b.cs,
    overallDifficulty: b.accuracy,
    approachRate: b.ar,
    hpDrain: b.drain,
    passcount: b.passcount,
    playcount: b.playcount,
  }));

  // Sort diffs by star rating
  diffs.sort((a, b) => a.difficultyRating - b.difficultyRating);

  return {
    id: set.id,
    title: set.title,
    titleUnicode: set.title_unicode || set.title,
    artist: set.artist,
    artistUnicode: set.artist_unicode || set.artist,
    creator: set.creator,
    creatorId: set.user_id,
    status: set.status,
    bpm: set.bpm,
    covers: set.covers || {
      cover: `https://assets.ppy.sh/beatmaps/${set.id}/covers/cover.jpg`,
      card: `https://assets.ppy.sh/beatmaps/${set.id}/covers/card.jpg`,
      list: `https://assets.ppy.sh/beatmaps/${set.id}/covers/list.jpg`,
      slimcover: `https://assets.ppy.sh/beatmaps/${set.id}/covers/slimcover.jpg`,
    },
    favouriteCount: set.favourite_count || 0,
    playCount: set.play_count || 0,
    previewUrl: `https://b.ppy.sh/preview/${set.id}.mp3`,
    difficulties: diffs,
    starRange: diffs.length > 0
      ? { min: diffs[0].difficultyRating, max: diffs[diffs.length - 1].difficultyRating }
      : { min: 0, max: 0 },
    downloadUrl: `/api/download?beatmapsetId=${set.id}`,
  };
}
