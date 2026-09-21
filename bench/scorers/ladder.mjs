// DEV-ONLY (bench/): matching benchmark harness. Not imported by src/, not deployed.
/**
 * Stage 1 (artist verdict ladder) + Stage 2 (artist confidence from provenance).
 *
 * Two changes from baseline:
 *
 * 1. The artist is a *gate*, not a weight. Baseline adds and subtracts, so a perfect
 *    title score pays for a total artist mismatch — measurably: the surviving baseline
 *    failures score 215 and 200, so no threshold can reject them. Here a confident
 *    DIFFERENT returns -Infinity and cannot be bought back.
 *
 * 2. Which artist string we trust depends on where it came from. Spotify/Apple hand us
 *    a structured artist field; a YouTube channel name is a guess, and the `Artist - Title`
 *    splitter is a guess on top of a guess. Only a high-confidence artist is allowed to
 *    *reject*; a low-confidence one can still confirm.
 */
export const name = 'ladder';

const norm = s => (s || '').toLowerCase().replace(/^the\s+/, '').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const toks = s => s.split(' ').filter(Boolean);

/**
 * Fold competing romanizations of the same Japanese sound onto one spelling:
 * Hepburn vs Kunrei (shi/si, tsu/tu, chi/ti, ji/zi, fu/hu) and dropped long vowels
 * (ou->o, uu->u). Catches Tsuyu/Tuyu, Yousei/Yosei, Shion/Sion — a large real class
 * that bigram similarity handles badly because the strings are short.
 */
function romajiFold(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .replace(/shi/g, 'si').replace(/chi/g, 'ti').replace(/tsu/g, 'tu')
    .replace(/ji/g, 'zi').replace(/fu/g, 'hu')
    .replace(/sh/g, 'sy').replace(/ch/g, 'ty').replace(/j/g, 'zy')
    .replace(/ou/g, 'o').replace(/uu/g, 'u');
}

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

/**
 * Guarded token-set containment. The guard is what stops "Ado" matching "Ado Fan Remix"
 * purely on a 3-letter token: the contained side must carry at least one token of >= 4
 * characters, or be a full-string equality.
 */
function tokenContained(a, b) {
  const ta = new Set(toks(a)), tb = new Set(toks(b));
  if (!ta.size || !tb.size) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!large.has(t)) return false;
  return [...small].some(t => t.length >= 4) || a === b;
}

/** First rung that fires wins. Never falls through to a numeric blend. */
export function artistVerdict(set, tArtist) {
  const t = norm(tArtist);
  if (!t) return { verdict: 'UNKNOWN', confidence: 0, rung: 0 };

  const a = norm(set.artist), au = norm(set.artist_unicode);
  const tags = new Set(toks(norm(set.tags)));

  if (t === a || t === au) return { verdict: 'SAME', confidence: 1.0, rung: 1 };
  // rung 2 (Stage 0 alias probe) slots in here once the probe exists
  if (tokenContained(t, a) || tokenContained(t, au)) return { verdict: 'SAME', confidence: 0.9, rung: 3 };

  const tf = romajiFold(t);
  if (tf.length >= 4 && (tf === romajiFold(a) || tf === romajiFold(au)))
    return { verdict: 'SAME', confidence: 0.85, rung: 4 };

  const tt = toks(t);
  if (tt.length && tt.every(x => tags.has(x)) && (tt.length >= 2 || tt.some(x => x.length >= 5)))
    return { verdict: 'WEAK', confidence: 0.6, rung: 5 };

  for (const cand of [a, au]) {
    if (t.length >= 6 && cand.length >= 6 && bigramDice(t, cand) >= 0.8)
      return { verdict: 'WEAK', confidence: 0.5, rung: 6 };
  }
  return { verdict: 'DIFFERENT', confidence: 0, rung: 7 };
}

function titleSimilarity(set, tTitle) {
  const t = norm(tTitle);
  if (!t) return 0;
  let best = 0;
  for (const cand of [norm(set.title), norm(set.title_unicode)]) {
    if (!cand) continue;
    if (cand === t || tokenContained(t, cand)) return 1;
    const d = bigramDice(t, cand);
    const bar = Math.min(t.length, cand.length) < 6 ? 0.85 : 0.55;
    if (d >= bar && d > best) best = d;
  }
  return best;
}

/**
 * Stage 2: provenance decides how far the artist is trusted.
 * Structured metadata (Spotify/Apple) is authoritative, so we use the source's own
 * artist field and never let the `Artist - Title` splitter overwrite it — that splitter
 * is what turns "Re:Re:" into artist "Re" and "Lemon - Kenshi Yonezu" into artist "Lemon".
 */
export function resolve(ctx) {
  const structured = ctx.source === 'spotify' || ctx.source === 'apple';
  if (structured && ctx.channelTitle) {
    // Structured sources already separate artist from title, so the `Artist - Title`
    // splitter has nothing to add and plenty to break: it turns the track "Re:Re:" into
    // artist "Re" / title "Re:" by splitting on the bare colon. Take both fields as given.
    return { title: ctx.rawTitle || ctx.cleanedTitle, artist: ctx.channelTitle, artistConfidence: 'high' };
  }
  return { title: ctx.cleanedTitle, artist: ctx.cleanedArtist || ctx.channelTitle || '', artistConfidence: 'low' };
}

export function score(set, title, artist, resolved = {}) {
  const tSim = titleSimilarity(set, title);
  if (tSim === 0) return -Infinity; // nothing to talk about

  const { verdict } = artistVerdict(set, artist);

  // The gate. A confident DIFFERENT is not a penalty to be outscored — it is a refusal.
  if (verdict === 'DIFFERENT' && resolved.artistConfidence === 'high') return -Infinity;

  let s = 160 * tSim - 60;
  if (verdict === 'SAME') s += 100;
  else if (verdict === 'WEAK') s += 30;
  else if (verdict === 'DIFFERENT') s -= 40; // low-confidence artist: doubt, not refusal
  if (set.status === 'ranked' || set.status === 'loved') s += 15;
  return s;
}
