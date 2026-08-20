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

const KNOWN_SONG_ARTISTS = {

};

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

  // 2. Artist matching (including known original band for covers)
  const knownOriginal = KNOWN_SONG_ARTISTS[tTitle] || KNOWN_SONG_ARTISTS[tTitle.replace(/\s+bury me$/, '')];
  let isArtistMatch = false;

  if (tArtist && bmArtist) {
    if (bmArtist === tArtist || bmArtist.includes(tArtist) || tArtist.includes(bmArtist)) {
      score += 100;
      isArtistMatch = true;
    }
  }

  if (!isArtistMatch && knownOriginal) {
    if (bmArtist === knownOriginal || bmArtist.includes(knownOriginal) || knownOriginal.includes(bmArtist)) {
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
    const searchUrl = isRankedOnly
      ? `https://osu.ppy.sh/api/v2/beatmapsets/search?q=${encodeURIComponent(q)}&sort=relevance_desc${modeParam ? `&m=${modeParam}` : ''}&s=ranked`
      : `https://osu.ppy.sh/api/v2/beatmapsets/search?q=${encodeURIComponent(q)}&sort=relevance_desc${modeParam ? `&m=${modeParam}` : ''}&s=any`;

    try {
      const res = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

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

  // Minimum threshold: require at least 70 points
  const minThreshold = 70;
  const filteredSets = allFoundSets.filter(s => (s._score || 0) >= minThreshold);

  const formatted = filteredSets.map(formatBeatmapset);

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
    mirrorUrls: {
      catboy: `https://catboy.best/d/${set.id}`,
      nerinyan: `https://api.nerinyan.moe/d/${set.id}`,
      beatconnect: `https://beatconnect.io/b/${set.id}`,
    },
  };
}

export default searchOsuBeatmaps;
