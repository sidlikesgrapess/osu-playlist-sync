/**
 * osu! API v2 client and beatmap search helper.
 * Handles OAuth2 Client Credentials grant and querying beatmapsets.
 */
import { strictnessProfile } from './matchStrictness.js';
import { isRankedStatus, upstreamStatusFor } from './beatmapFormat.js';
import { UA_PROFILES } from './http.js';

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
        'User-Agent': UA_PROFILES.server,
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
      'User-Agent': UA_PROFILES.server,
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

/**
 * Applies the UI's mode / status filters to a normalized beatmapset.
 * osu! only supports a mode filter natively on score endpoints, so the
 * collection endpoints are filtered here instead.
 */
function matchesCollectionFilters(beatmapset, mode, status) {
  if (status === 'ranked' && !isRankedStatus(beatmapset.status)) {
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

  const user = encodeURIComponent(userId);
  const pathByType = {
    best: `/users/${user}/scores/best?limit=${limit}&offset=0${modeParam}`,
    most_played: `/users/${user}/beatmapsets/most_played?limit=${limit}&offset=0`,
    favourite: `/users/${user}/beatmapsets/favourite?limit=${limit}&offset=0`,
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
 * Normalizes strings for loose comparison (removes punctuation, prefixes like 'the', and extra
 * spaces). Keeps any Unicode letter/number (not just a-z0-9) so CJK and other non-Latin titles
 * survive normalization instead of collapsing to an empty string that spuriously "matches" any
 * other empty string.
 */
function normalizeForComparison(str = '') {
  return str
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str) {
  return str.split(' ').filter(Boolean);
}

/**
 * Folds competing romanizations of the same Japanese sound onto one spelling: Hepburn vs
 * Kunrei (shi/si, tsu/tu, chi/ti, ji/zi, fu/hu) and dropped long vowels (ou->o, uu->u).
 * Catches Tsuyu/Tuyu, Yousei/Yosei, Shion/Sion -- a class bigram similarity handles badly,
 * because the strings are short enough for a couple of shared bigrams to dominate.
 */
function romajiFold(str = '') {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/shi/g, 'si').replace(/chi/g, 'ti').replace(/tsu/g, 'tu')
    .replace(/ji/g, 'zi').replace(/fu/g, 'hu')
    .replace(/sh/g, 'sy').replace(/ch/g, 'ty').replace(/j/g, 'zy')
    .replace(/ou/g, 'o').replace(/uu/g, 'u');
}

/**
 * Order-independent whole-word containment, guarded: the contained side must carry at least
 * one token of 4+ characters, or be a full-string equality. Without the guard a 3-letter
 * artist ("Ado") matches anything that merely contains it as a token.
 */
function tokenSetSimilar(a, b) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) {
    if (!large.has(t)) return false;
  }
  return [...small].some(t => t.length >= 4) || a === b;
}

/** Character-bigram Dice coefficient: a continuous 0-1 similarity, no dependency. */
function bigramDice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = s => {
    const arr = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
    return arr;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return 0;
  const counts = new Map();
  for (const bg of A) counts.set(bg, (counts.get(bg) || 0) + 1);
  let overlap = 0;
  for (const bg of B) {
    const c = counts.get(bg) || 0;
    if (c > 0) {
      overlap++;
      counts.set(bg, c - 1);
    }
  }
  return (2 * overlap) / (A.length + B.length);
}

/**
 * Whole-word containment for TITLES. Deliberately not `tokenSetSimilar`, whose "needs a
 * 4-character token" guard exists to stop a short *artist* ("Ado") matching everything --
 * applied to titles it rejects legitimate short ones like "Dai Dai", whose tokens are three
 * characters. Titles are guarded on total length instead, which is the property that
 * actually makes a title distinctive.
 */
function titleTokensContained(target, candidate) {
  if (target.length < 4) return false;
  const tt = new Set(tokenize(target));
  const ct = new Set(tokenize(candidate));
  if (tt.size === 0 || ct.size === 0) return false;
  for (const tok of tt) {
    if (!ct.has(tok)) return false;
  }
  return true;
}

/**
 * Title similarity, graded so an exact match outranks a containment match.
 * Without the gap, "Faded" and "Nightcore - Faded, Cheap Thrills, Alive, Airplanes Mashup"
 * both score a flat 1.0, and a mashup can tie the real song then win on artist noise.
 */
function titleSimilarity(beatmap, targetTitle) {
  const t = normalizeForComparison(targetTitle || '');
  if (!t) return 0;
  let best = 0;
  const candidates = [
    normalizeForComparison(beatmap.title || ''),
    normalizeForComparison(beatmap.title_unicode || ''),
  ];
  for (const cand of candidates) {
    if (!cand) continue;
    if (cand === t) return 1;
    if (titleTokensContained(t, cand)) best = Math.max(best, 0.92);
    const dice = bigramDice(t, cand);
    const bar = Math.min(t.length, cand.length) < 6 ? 0.85 : 0.55;
    if (dice >= bar) best = Math.max(best, dice * 0.9);
  }
  return best;
}

/**
 * Is this beatmapset by the same artist as the target? A ladder of independent evidence,
 * first rung wins -- deliberately NOT a numeric blend, because the caller needs a verdict it
 * can gate on, not a score that another signal can outweigh.
 *
 * `aliases` comes from the artist probe (see `probeOsuArtist`): every beatmapset carries
 * `artist` and `artist_unicode` as a paired observation, so the corpus itself is a
 * (romanized, native) alias dictionary. That is how a target written in one script is known
 * to be the artist osu! spells in another, when the two share no characters at all.
 */
export function artistVerdict(beatmap, targetArtist, aliases = null) {
  const t = normalizeForComparison(targetArtist || '');
  if (!t) return { verdict: 'UNKNOWN', confidence: 0, rung: 0 };

  const a = normalizeForComparison(beatmap.artist || '');
  const au = normalizeForComparison(beatmap.artist_unicode || '');
  const tagTokens = new Set(tokenize(normalizeForComparison(beatmap.tags || '')));

  if (t === a || t === au) return { verdict: 'SAME', confidence: 1, rung: 1 };

  if (aliases && aliases.size && (aliases.has(a) || aliases.has(au))) {
    return { verdict: 'SAME', confidence: 0.95, rung: 2 };
  }

  if (tokenSetSimilar(t, a) || tokenSetSimilar(t, au)) {
    return { verdict: 'SAME', confidence: 0.9, rung: 3 };
  }

  const tf = romajiFold(t);
  if (tf.length >= 4 && (tf === romajiFold(a) || tf === romajiFold(au))) {
    return { verdict: 'SAME', confidence: 0.85, rung: 4 };
  }

  // Same name with something glued on, or spaced differently: "Steve Lacy" vs
  // "SteveLacyVEVO", "Yonezu Kenshi" vs "YonezuKenshi". Mappers routinely paste a
  // channel or upload name into the artist field, and refusing those would reject
  // genuinely correct maps. Compared with spaces removed, and length-guarded so short
  // names cannot be swallowed by a longer unrelated one.
  const squash = x => x.replace(/ /g, '');
  const ts = squash(t);
  if (ts.length >= 6) {
    for (const cand of [squash(a), squash(au)]) {
      if (cand && (cand.includes(ts) || ts.includes(cand))) {
        return { verdict: 'SAME', confidence: 0.8, rung: 4.5 };
      }
    }
  }

  // Whole-word against the tag token set, never a substring of the joined blob -- a raw
  // `includes` credits "Ado" for any map merely tagged "shadow".
  const tt = tokenize(t);
  if (tt.length && tt.every(x => tagTokens.has(x)) && (tt.length >= 2 || tt.some(x => x.length >= 5))) {
    return { verdict: 'WEAK', confidence: 0.6, rung: 5 };
  }

  for (const cand of [a, au]) {
    if (t.length >= 6 && cand.length >= 6 && bigramDice(t, cand) >= 0.8) {
      return { verdict: 'WEAK', confidence: 0.5, rung: 6 };
    }
  }

  return { verdict: 'DIFFERENT', confidence: 0, rung: 7 };
}

/**
 * Score how well an osu! beatmapset matches the target song title & artist.
 *
 * The artist is a GATE, not a weight. An additive score lets a perfect title pay for a total
 * artist mismatch, which is how two different songs sharing a title both used to score 215 --
 * no threshold could separate them. A confident DIFFERENT now returns -Infinity and cannot be
 * bought back by any other signal.
 *
 * @param {object} beatmap                                  beatmapset from /beatmapsets/search
 * @param {string} targetTitle
 * @param {string} targetArtist
 * @param {object} [options]
 * @param {'high'|'low'|'none'} [options.artistConfidence]  how far the artist string is trusted
 * @param {Set<string>} [options.aliases]                   alias set from the artist probe
 * @param {number} [options.titleFloor=0.5]                 below this title similarity, refuse outright
 * @param {number} [options.maxArtistRung=6]                deepest artist-ladder rung still counted as the same person
 */
export function scoreBeatmapMatch(beatmap, targetTitle = '', targetArtist = '', options = {}) {
  const {
    artistConfidence = 'high',
    aliases = null,
    titleFloor = 0.5,
    maxArtistRung = 6,
  } = options;

  const tSim = titleSimilarity(beatmap, targetTitle);
  if (targetTitle && tSim < titleFloor) return -Infinity;

  let score = targetTitle ? 160 * tSim - 60 : 0;

  if (targetArtist) {
    const raw = artistVerdict(beatmap, targetArtist, aliases);

    // Strictness decides how far down the ladder still counts as the same person. The rungs
    // are ordered by how much they prove: 1 exact, 2 corpus alias, then progressively
    // weaker inference down to a bigram-similarity guess at 6. Capping the rung turns the
    // ladder into the strictness control it already implicitly was.
    const verdict = raw.verdict !== 'DIFFERENT' && raw.rung > maxArtistRung ? 'DIFFERENT' : raw.verdict;

    if (artistConfidence === 'none') {
      // The artist string was checked against the corpus and is not a real osu! artist
      // (a YouTube channel such as "Nightcore Gaming"). It may neither confirm nor deny --
      // judge on title alone rather than letting a junk string earn artist credit.
    } else if (verdict === 'SAME') {
      score += 100;
    } else if (verdict === 'WEAK') {
      score += 30;
    } else if (verdict === 'DIFFERENT') {
      if (artistConfidence === 'high') return -Infinity; // the gate
      score -= 40;                                       // doubt, not refusal
    }
  }

  if (beatmap.status === 'ranked' || beatmap.status === 'loved') {
    score += 15;
  }

  // Popularity as a tiebreak only: log-scaled and capped well below any title or artist step,
  // so it separates near-identical candidates and never overrides a real signal.
  score += Math.min(10, Math.log10(1 + (beatmap.favourite_count || 0)) * 2.5);

  return score;
}

// Artist probes are memoized for the life of a warm serverless instance: a playlist reuses
// artists heavily, and only low-confidence artists are probed at all.
const artistProbeCache = new Map();

/**
 * Read the (romanized, native) spellings of one artist out of a set of beatmapsets.
 *
 * Only learn an alias through a set whose own artist field already links back to the
 * target. Otherwise a search that returned loosely related artists would poison the
 * dictionary with genuine strangers -- "Nightcore Gaming" would inherit Nightcore's names.
 *
 * That conservatism is also what makes the alias set a *presence test*: if it comes back
 * empty, nothing in the result is really by this name.
 */
export function aliasesFromSets(artist, sets) {
  const key = normalizeForComparison(artist);
  const tf = romajiFold(key);
  const aliases = new Set();
  if (!key) return aliases;

  for (const set of sets || []) {
    const a = normalizeForComparison(set.artist || '');
    const au = normalizeForComparison(set.artist_unicode || '');
    const linked = a === key || au === key
      || (tf.length >= 4 && (romajiFold(a) === tf || romajiFold(au) === tf));
    if (!linked) continue;
    if (a) aliases.add(a);
    if (au) aliases.add(au);
  }
  return aliases;
}

/**
 * Ask osu! what it has by this artist, and read the answer off the corpus.
 *
 * This inverts the usual question. Instead of "does this candidate's artist string look like
 * mine?" -- unbounded fuzzy matching -- we ask "what does osu! have by this name?", which is a
 * retrieval problem the API answers directly. Two things fall out:
 *
 *   - an alias set, because every returned set pairs `artist` with `artist_unicode`
 *   - a presence count, which says whether the artist string is real at all
 *
 * Uses the `artist=` search operator, verified live to be both supported and purer than a
 * bare text query.
 */
export async function probeOsuArtist(artist, token) {
  const key = normalizeForComparison(artist);
  if (!key) return null;
  if (artistProbeCache.has(key)) return artistProbeCache.get(key); // may be null: a cached failure

  let probe;
  try {
    const path = `/beatmapsets/search?q=${encodeURIComponent(`artist=${artist}`)}&sort=relevance_desc&s=any`;
    const data = await osuApiGet(path, token);
    const sets = data.beatmapsets || [];

    probe = { artist, count: sets.length, aliases: aliasesFromSets(artist, sets) };
  } catch (e) {
    // A failed probe must not be cached as "this artist does not exist" -- that would turn a
    // transient 429 into a confident, wrong rejection. Cache an explicit `failed` marker
    // instead: unknown for scoring purposes, but not re-requested for every remaining track
    // in the batch, which would make a rate limit considerably worse.
    console.warn(`[osu! Probe] Failed for "${artist}":`, e.status || e.message);
    artistProbeCache.set(key, null);
    return null;
  }

  artistProbeCache.set(key, probe);
  return probe;
}

/**
 * Decide how far an unstructured artist string can be trusted. Pure: no fetch.
 *
 * The key economy: the candidate pool is itself evidence. If any returned beatmapset names
 * this artist *exactly*, the artist demonstrably exists on osu! and no probe is needed. A
 * probe is only worth a call in the ambiguous zone -- where the artist merely resembles a
 * mapset's artist, which is exactly where junk lives ("Nightcore Gaming" ~ "Nightcore").
 * On a YouTube playlist that takes the cost from one call per distinct artist to roughly
 * zero, because a correctly extracted artist ("Alan Walker") matches exactly and is free.
 *
 * `probe` is a probeOsuArtist result, `null` for a failed probe, or `undefined` for "not
 * probed yet" -- in which case the answer may come back `needsProbe`.
 *
 * Exported because the benchmark has to replay this decision against captured probes. It
 * used to keep its own copy, which silently drifted and made the bench agree with a version
 * of the matcher that no longer existed. There is one copy now; bench/ imports it.
 */
export function resolveArtistTrust(artist, candidates, probe) {
  const t = normalizeForComparison(artist);
  if (!t) return { artistConfidence: 'none', aliases: null };

  // A candidate that already names this artist exactly IS the verification -- and the sets
  // that name them hand over their own (romanized, native) spellings for free, so the alias
  // dictionary comes out of the pool rather than out of an extra call.
  const aliases = aliasesFromSets(artist, candidates);
  if (aliases.size > 0) return { artistConfidence: 'high', aliases };

  // Nothing in the pool settles it, so the corpus has to be asked directly.
  if (probe === undefined) return { artistConfidence: 'low', aliases: null, needsProbe: true };

  // A failed probe is the only genuinely unknown case. Doubt, never refuse: a transient 429
  // must not turn into a confident rejection.
  if (!probe) return { artistConfidence: 'low', aliases: null };

  // Presence is the ALIAS set, not the row count. Aliases are only recorded for sets whose
  // own artist links back to the target, so "Kaneko Lumi" (3 rows, all genuinely hers) is
  // real while "Nightcore Gaming" (4 loosely-related rows, none linked) is not. Counting
  // rows ranked junk above a real-but-obscure artist -- and an obscure artist is exactly
  // where a title collision is most likely, so it was the worst possible case to ignore.
  if (probe.aliases.size > 0) return { artistConfidence: 'high', aliases: probe.aliases };

  // Nothing on osu! answers to this name at all. Whether that is an obscure artist or a
  // channel that was never an artist, no candidate here can be by them, so the artist is
  // still allowed to refuse. Refusing is not hiding: the closest maps come back either way,
  // flagged, so the user sees the artist caveat rather than a silent wrong match.
  if (probe.count === 0) return { artistConfidence: 'high', aliases: null };

  // The search matched things, but nothing that actually bears this name: the string is not
  // an artist. It can neither confirm nor deny -- judge on title alone.
  return { artistConfidence: 'none', aliases: null };
}

async function verifyLowConfidenceArtist(artist, candidates, token) {
  const fromPool = resolveArtistTrust(artist, candidates, undefined);
  if (!fromPool.needsProbe) return { ...fromPool, probed: false };

  const probe = await probeOsuArtist(artist, token);
  return { ...resolveArtistTrust(artist, candidates, probe), probed: true };
}

const MAX_QUERY_VARIANTS = 4;

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

  // Structured metadata (Spotify, Apple) is authoritative straight away, so the gate is
  // active while we score and can end the query loop early. Anything else is scored
  // provisionally at 'low' -- which never hard-rejects -- and the real verdict is settled
  // after the loop, when the candidates themselves can answer it without an extra call.
  //
  // Trust follows where the artist string came from, not the platform (F-28): an artist the
  // cleaner split out of the title ("Re:Re:" gives "Re") is a guess even on an Apple track,
  // so `artistFromTitle` sends it through resolveArtistTrust like any unstructured one.
  const structuredArtist = (options.source === 'spotify' || options.source === 'apple')
    && !options.artistFromTitle;
  // One slider, three knobs -- see src/lib/matchStrictness.js for why a bare cutoff could
  // not express either end of the range.
  const strict = strictnessProfile(options.strictness);
  const floors = { titleFloor: strict.titleFloor, maxArtistRung: strict.maxArtistRung };

  let artistConfidence = targetArtist ? (structuredArtist ? 'high' : 'low') : 'none';
  let aliases = null;
  let scoreOptions = { artistConfidence, aliases, ...floors };

  const variants = Array.from(
    new Set([
      targetArtist && targetTitle ? `${targetArtist} ${targetTitle}`.trim() : null,
      query,
      ...(options.queries || []),
      targetTitle,
    ].filter(Boolean))
  );
  // Every variant is one upstream call, so at most MAX_QUERY_VARIANTS run (F-14): the first
  // three and the bare title. The title is the best recall query, so it is never the one
  // cut, and the order is otherwise the one the bench fixtures were captured in.
  let othersKept = 0;
  const queriesToRun = variants.length > MAX_QUERY_VARIANTS
    ? variants.filter(q => q === targetTitle || othersKept++ < MAX_QUERY_VARIANTS - 1)
    : variants;

  const modeMap = { osu: '0', taiko: '1', fruits: '2', mania: '3' };
  const modeParam = options.mode && modeMap[options.mode] ? modeMap[options.mode] : null;

  // 'ranked' is the "Ranked & Loved" filter: RANKED_LOVED_STATUSES (beatmapFormat.js). The
  // upstream `s=` is only a pool hint; the local isRankedStatus filter below decides.
  const statusFilter = options.status || 'any';
  const isRankedOnly = statusFilter === 'ranked';

  let allFoundSets = [];
  // Candidates the artist gate refused. They never become results, but they are exactly
  // what makes a refusal explainable ("this song is on osu!, just not by that artist"),
  // so they are kept aside rather than discarded.
  let gatedOut = [];
  let bestScore = -100;

  for (const q of queriesToRun) {
    const searchPath = `/beatmapsets/search?q=${encodeURIComponent(q)}&sort=relevance_desc${modeParam ? `&m=${modeParam}` : ''}&s=${upstreamStatusFor(statusFilter)}`;

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
          sets = sets.filter(bm => isRankedStatus(bm.status));
        }

        for (const bm of sets) {
          const score = scoreBeatmapMatch(bm, targetTitle, targetArtist, scoreOptions);
          if (score === -Infinity) {
            if (!gatedOut.some(existing => existing.id === bm.id)) gatedOut.push(bm);
            continue;
          }
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

  // Settle a low-confidence artist now that we have candidates to reason from, then rescore.
  // Rescoring is in-memory; the only possible extra network call is a single probe, and only
  // when no candidate named the artist exactly.
  if (targetArtist && !structuredArtist) {
    const verdict = await verifyLowConfidenceArtist(targetArtist, [...allFoundSets, ...gatedOut], token);
    artistConfidence = verdict.artistConfidence;
    aliases = verdict.aliases;
    scoreOptions = { artistConfidence, aliases, ...floors };

    const rescored = [];
    for (const bm of [...allFoundSets, ...gatedOut]) {
      const score = scoreBeatmapMatch(bm, targetTitle, targetArtist, scoreOptions);
      if (score === -Infinity) continue;
      rescored.push({ ...bm, _score: score });
    }
    gatedOut = [...allFoundSets, ...gatedOut].filter(bm => !rescored.some(r => r.id === bm.id));
    allFoundSets = rescored;
    bestScore = allFoundSets.reduce((m, s) => Math.max(m, s._score), -100);
  }

  // Sort candidate mapsets by match score descending
  allFoundSets.sort((a, b) => (b._score || 0) - (a._score || 0));

  // Derived from the same slider that set the floors above, so the cutoff can never
  // disagree with them.
  const minThreshold = strict.minScore;
  const filteredSets = allFoundSets.filter(s => Number.isFinite(s._score) && s._score >= minThreshold);

  const formatted = filteredSets.map(s => ({ ...formatBeatmapset(s), matchScore: s._score }));

  // Stage 4: when nothing passed, say *why*. "No beatmaps found" and "this song exists on
  // osu!, but not by this artist" are different answers, and the second one is the whole
  // point of gating on the artist.
  //
  // For wrong-artist specifically we still RETURN the maps. Hiding them helps nobody: the
  // user can see the artist is different and decide. What the gate buys is that the result
  // arrives labelled and unselected, instead of silently posing as a confident match.
  let rejection = null;
  let results = formatted;
  if (formatted.length === 0) {
    // Look in the gated-out pile too — a wrong-artist candidate is refused precisely
    // because it matched the title, so it is never in allFoundSets.
    //
    // The bar comes from the slider, not from a constant. The gate is absolute and the
    // slider must not weaken it, so this is the only lever that lets 0 mean what it says:
    // at 0 it admits the whole gated pile, and the row shows those candidates flagged
    // instead of a bare "no beatmaps by this artist" for maps osu! plainly returned.
    const titleMatches = [...gatedOut, ...allFoundSets]
      .filter(s => titleSimilarity(s, targetTitle) >= strict.salvageFloor)
      .sort((a, b) =>
        (titleSimilarity(b, targetTitle) - titleSimilarity(a, targetTitle))
        || ((b.favourite_count || 0) - (a.favourite_count || 0)))
      .slice(0, 8);

    if (targetArtist && artistConfidence === 'none') {
      // The string is not an artist (resolveArtistTrust found sets but none by that name), so
      // it can neither confirm nor refuse. Salvage still runs first (F-33): a close title is
      // the best answer there is. The results are flagged `titleOnly`, never `artistOverride`,
      // because "Could not find one by X" would claim X is an artist. Both flags keep them out
      // of auto-select (isAutoSelectable), and `matchScore: null` records that they never
      // cleared the cutoff.
      rejection = { kind: 'artist-unknown', artist: targetArtist };
      results = titleMatches.map(bm => ({
        ...formatBeatmapset(bm),
        matchScore: null,
        titleOnly: true,
      }));
    } else {
      // Only on failure, and only for an artist we did not already probe: one call to tell
      // "this artist has nothing on osu!" apart from "this song of theirs is not mapped".
      // Both return no beatmaps; they are very different things to show a user.
      let absent = false;
      if (targetArtist && artistConfidence === 'high') {
        const probe = await probeOsuArtist(targetArtist, token);
        absent = Boolean(probe && probe.count === 0);
      }

      if (titleMatches.length > 0) {
        // `artist-absent` and `wrong-artist` differ only in what we can tell the user -- the
        // artist has nothing on osu! at all, versus this particular song of theirs is not
        // mapped. Both refused the same candidates for the same reason, so both show them.
        // Silently returning nothing is what makes a deliberate refusal look like a failure.
        rejection = { kind: absent ? 'artist-absent' : 'wrong-artist', artist: targetArtist };

        // Returned as ordinary results so the row, the alternative picker and download all
        // work normally -- but flagged. `artistOverride` is what stops page.js auto-selecting
        // them, and `matchScore: null` records that they never passed the gate.
        results = titleMatches.map(bm => ({
          ...formatBeatmapset(bm),
          matchScore: null,
          artistOverride: true,
        }));
      } else if (absent) {
        rejection = { kind: 'artist-absent', artist: targetArtist };
      } else {
        rejection = { kind: 'no-match' };
      }
    }
  }

  return {
    beatmapsets: results,
    total: results.length,
    bestScore: Number.isFinite(bestScore) && bestScore >= minThreshold ? bestScore : 0,
    artistConfidence,
    rejection,
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
