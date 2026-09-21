// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * Stage 3: the decision matrix, tuned for a decisive single pick.
 *
 * Three changes over `ladder`, all aimed at the top-1 answer rather than the alternatives list:
 *
 * 1. PROBE-VERIFIED CONFIDENCE. A low-confidence artist (YouTube channel, or a guess from
 *    the `Artist - Title` splitter) is checked against the corpus before it is allowed to
 *    confirm anything. `Nightcore Gaming` returns 4 sets — it is not an osu! artist, so it
 *    must not earn artist credit by token-matching a mapset called `Nightcore`. Structured
 *    Spotify/Apple artists skip the check, so most tracks cost no extra call.
 *
 * 2. GRADED TITLE. Exact equality now outranks containment. Previously `Faded` and
 *    `Nightcore - Faded, Cheap Thrills, Alive, Airplanes Mashup` both scored a flat 1.0,
 *    so a mashup could tie the real song and win on artist noise.
 *
 * 3. POPULARITY TIEBREAK (MATCHING_PLAN 2e). Log-scaled and capped, so it only separates
 *    near-ties and can never outweigh a title or artist signal.
 */
import { artistVerdict as aliasVerdict } from './ladder-probe.mjs';
import { resolve as baseResolve } from './ladder.mjs';

export const name = 'matrix';
export const usesProbe = true;
export const probeMode = 'verify';
export const resolve = baseResolve;

/** Below this, the artist string is not a real osu! artist — it cannot confirm a match. */
const MIN_PRESENCE = 5;

const norm = s => (s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const toks = s => s.split(' ').filter(Boolean);

function bigramDice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const g = s => { const r = []; for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2)); return r; };
  const A = g(a), B = g(b);
  if (!A.length || !B.length) return 0;
  const c = new Map();
  for (const x of A) c.set(x, (c.get(x) || 0) + 1);
  let o = 0;
  for (const x of B) { const n = c.get(x) || 0; if (n > 0) { o++; c.set(x, n - 1); } }
  return (2 * o) / (A.length + B.length);
}
function tokenContained(a, b) {
  const ta = new Set(toks(a)), tb = new Set(toks(b));
  if (!ta.size || !tb.size) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!large.has(t)) return false;
  return [...small].some(t => t.length >= 4) || a === b;
}

/** Exact 1.0 > containment 0.92 > dice. The gap is what stops a mashup tying the real song. */
function titleSimilarity(set, tTitle) {
  const t = norm(tTitle);
  if (!t) return 0;
  let best = 0;
  for (const cand of [norm(set.title), norm(set.title_unicode)]) {
    if (!cand) continue;
    if (cand === t) return 1;
    if (tokenContained(t, cand)) best = Math.max(best, 0.92);
    const d = bigramDice(t, cand);
    const bar = Math.min(t.length, cand.length) < 6 ? 0.85 : 0.55;
    if (d >= bar) best = Math.max(best, d * 0.9);
  }
  return best;
}

export function score(set, title, artist, resolved = {}) {
  const tSim = titleSimilarity(set, title);
  if (tSim < 0.5) return -Infinity;

  const probe = resolved.probe || null;
  let confidence = resolved.artistConfidence;

  // Probe verification: an artist with no real corpus presence cannot be trusted either
  // way — it may not confirm a match, and it may not deny one.
  if (probe && confidence !== 'high' && probe.sets.length < MIN_PRESENCE) confidence = 'none';

  // The decisive negative: a high-confidence artist proven absent from osu! entirely.
  if (probe && confidence === 'high' && probe.sets.length === 0) return -Infinity;

  const { verdict } = aliasVerdict(set, artist, probe);

  let s = 160 * tSim - 60;

  if (confidence === 'none') {
    // No usable artist signal. Judge on title alone rather than guessing — and never
    // award artist credit that a junk string happened to earn.
  } else if (verdict === 'SAME') {
    s += 100;
  } else if (verdict === 'WEAK') {
    s += 30;
  } else if (verdict === 'DIFFERENT') {
    if (confidence === 'high') return -Infinity; // the gate
    s -= 40;                                      // doubt, not refusal
  }

  if (set.status === 'ranked' || set.status === 'loved') s += 15;

  // Tiebreak only: capped at 10, far below any title or artist step.
  s += Math.min(10, Math.log10(1 + (set.favourite_count || 0)) * 2.5);
  return s;
}
