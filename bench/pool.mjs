// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * Shared replay harness: given a snapshot and a scorer, reproduce what the pipeline
 * would return. Used by both the labeller (to pool candidates for review) and the
 * runner (to compute metrics), so they can never disagree about what a scorer "returns".
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const ROOT = new URL('.', import.meta.url);

/**
 * Snapshots freeze the API *responses* only. The fixture's expectations are re-read
 * from fixtures.json on every run and overlaid, so a mislabelled expectation can be
 * corrected without spending another capture pass against the rate-limited API.
 */
export function loadSnapshots() {
  const fixtures = new Map(
    JSON.parse(readFileSync(new URL('fixtures.json', ROOT), 'utf8')).map(f => [f.id, f])
  );
  return readdirSync(new URL('snapshots', ROOT))
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const snap = JSON.parse(readFileSync(new URL(`snapshots/${f}`, ROOT), 'utf8'));
      const live = fixtures.get(snap.fixture.id);
      return live ? { ...snap, fixture: { ...snap.fixture, ...live } } : snap;
    });
}

export const artistKey = (fixtureId, set) => `${fixtureId} :: ${set.artist} :: ${set.artist_unicode || ''}`;

export const slug = s => (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'empty';

/** Stage 0 probe for one artist, or null when that artist was never probed. */
export function loadProbe(artist) {
  const f = new URL(`probes/${slug(artist)}.json`, ROOT);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}

/**
 * Replays one fixture through a scorer.
 *
 * `searchOsuBeatmaps` early-exits at score >= 150, so a query variant late in the list
 * may never run in production. Honouring that here keeps the benchmark faithful to the
 * shipped pipeline rather than measuring an idealised all-queries version of it.
 */
export function replay(snap, scorer, { minScore = 70 } = {}) {
  // Each scorer resolves its own target from the raw material. Stage 2 changes *which*
  // artist string is trusted, so baking one choice into the harness would silently give
  // every scorer the new behaviour and make the baseline comparison meaningless.
  const ctx = {
    source: snap.fixture.source,
    channelTitle: snap.fixture.channelTitle || '',
    rawTitle: snap.fixture.rawTitle || '',
    cleanedTitle: snap.cleaned.title,
    cleanedArtist: snap.cleaned.artist || '',
  };
  const resolved = scorer.resolve
    ? scorer.resolve(ctx)
    : { title: ctx.cleanedTitle, artist: ctx.cleanedArtist || ctx.channelTitle, artistConfidence: 'high' };
  const { title, artist } = resolved;

  const pool = [];
  const seen = new Set();
  let best = -Infinity;

  // Scorers opt in to the Stage 0 probe. Baseline must NOT receive these extra candidates,
  // or the comparison would be measuring retrieval and scoring changes at once.
  //
  // probeMode 'eager' spends one probe per artist up front. 'lazy' runs the title queries
  // first and only probes when they failed to settle the question — so the probe becomes a
  // fallback that can never cost more than not having it, instead of a fixed tax.
  // 'verify' probes up front ONLY for a low-confidence artist, where the probe's job is to
  // decide whether the artist string is a real osu! artist at all. A structured Spotify /
  // Apple artist needs no such check, so most tracks pay nothing.
  const probeMode = scorer.usesProbe ? (scorer.probeMode || 'eager') : 'off';
  const needsVerify = probeMode === 'verify' && resolved.artistConfidence !== 'high';
  const probe = probeMode !== 'off' && (probeMode !== 'verify' || needsVerify) ? loadProbe(artist) : null;
  const buckets = (probeMode === 'eager' || needsVerify) && probe
    ? { '__probe__': { sets: probe.sets }, ...snap.byQuery }
    : { ...snap.byQuery };

  // What searchOsuBeatmaps hands to resolveArtistTrust: the sets the TITLE queries returned.
  // The probe's own results are excluded on purpose -- a probe for "X" trivially returns
  // sets by X, so including them would let the pool "verify" the artist for free and the
  // replay would stop exercising the probe path at all.
  const candidates = Object.values(snap.byQuery).flatMap(b => b.sets || []);

  let probeUsed = (probeMode === 'eager' || needsVerify) && !!probe;
  let bucketsUsed = 0;

  for (const q of Object.keys(buckets)) {
    bucketsUsed++;
    for (const set of buckets[q].sets || []) {
      const s = scorer.score(set, title, artist, { ...resolved, candidates, probe: (probeMode === 'eager' || needsVerify) ? probe : null });
      if (!seen.has(set.id)) {
        seen.add(set.id);
        pool.push({ ...set, _score: s });
      }
      if (s > best) best = s;
    }
    if (best >= 150) break; // mirrors the production early exit
  }

  // Lazy probe: the title queries did not settle it, so now spend the one extra call.
  if (probeMode === 'lazy' && probe && best < 150) {
    probeUsed = true;
    bucketsUsed++;
    for (const set of probe.sets) {
      if (seen.has(set.id)) continue;
      seen.add(set.id);
      pool.push(set);
    }
    // Re-score everything, not just the probe's own results. The probe's value is the
    // alias set it teaches (かめりあ == "Camellia"), and that applies just as much to
    // candidates the title queries already returned. Costs no extra API call.
    for (const set of pool) {
      set._score = scorer.score(set, title, artist, { ...resolved, candidates, probe });
      if (set._score > best) best = set._score;
    }
  }

  pool.sort((a, b) => b._score - a._score);
  return {
    title, artist, resolved, pool, probeUsed, bucketsUsed,
    accepted: pool.filter(s => s._score >= minScore),
  };
}
