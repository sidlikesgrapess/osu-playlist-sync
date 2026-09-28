/**
 * Cleans song and YouTube video titles into an osu!-friendly title, artist and query list.
 *
 * F-46: there is no list of noise words. A title is parsed into a core plus tags (every
 * bracketed or quoted run, an unbracketed feat. clause, and trailing " | ", " / ", " - " and
 * " ~ " segments). Nothing is deleted by the parser: joining its parts gives the input back. Each
 * tag is then judged on evidence that does not depend on what language or genre it is in:
 *
 *   - its shape (pp, %, stars, 1080p, fps, a year, osu! mods) makes it certain noise;
 *   - it echoes the channel or the artist, so it cannot be part of the song's name;
 *   - it repeats on two or more tracks of the same playlist;
 *   - its bracket type: [] and 【】 lean noise, () is neutral, 「」 and 『』 hold the title;
 *   - its position: leading or trailing leans noise, interior leans title;
 *   - it is a feat./ft./with credit.
 *
 * Two hypotheses come out: `title` (H0) with every tag that leans noise stripped, and
 * `altTitle` (H1) that keeps the ambiguous tags. The cleaner does not pick between them for
 * good: searchOsuBeatmaps scores every candidate against both and keeps the better score.
 */

// Opening bracket -> closing bracket. 「」 and 『』 are quotes, not tags: they hold the title.
const BRACKET_PAIRS = {
  '(': ')', '（': '）', '[': ']', '［': '］', '{': '}', '【': '】', '〖': '〗', '〔': '〕', '《': '》', '〈': '〉',
  '「': '」', '『': '』',
};
const ROUND_BRACKETS = new Set(['(', '（']);
const QUOTE_BRACKETS = new Set(['「', '『']);
const DOUBLE_QUOTES = { '"': '"', '“': '”' };
const SINGLE_QUOTES = { "'": "'", '‘': '’' };

// Placeholders stand in for tags while the separators are looked at, so a separator inside a
// bracket ("[Han/Rom/Eng]", "【Vietsub + Kara】") can never split the title.
const PLACEHOLDER_BASE = 0xe000;
const PLACEHOLDER_CLASS = '\\uE000-\\uF8FF';
const placeholderAt = (i) => String.fromCharCode(PLACEHOLDER_BASE + i);
const placeholderIndex = (ch) => ch.charCodeAt(0) - PLACEHOLDER_BASE;
const PLACEHOLDER_RUN = new RegExp(`[${PLACEHOLDER_CLASS}]`, 'g');

// osu! mod codes. A shape, not a word: two letters from a closed set of game codes.
const MOD = '(?:HD|HR|DT|NC|FL|EZ|HT|SO|NF|TD|NM|RX|AP|V2|AT|PF|SD)';

// Shapes that are noise wherever they stand, because no song name has them: mods, hit
// counts, accuracy with its grade, a leaderboard rank, pp and a star rating.
const SHAPES = [
  new RegExp(`\\s*\\+\\s*${MOD}+(?![\\p{L}\\p{N}])`, 'giu'),
  new RegExp(`(?<![\\p{L}\\p{N}])${MOD}{2,}(?![\\p{L}\\p{N}])`, 'gu'),
  /\s*\b\d+x(?:100|50|miss(?:es)?|sb|sliderbreaks?)\b/gi,
  /\s*(?:\b(?:FC|SS)\s+)?\b\d{1,3}(?:\.\d{1,2})?%(?:\s*(?:FC|SS|S|A)\b)?/gi,
  /\s*#\d+\b/g,
  /\s*\b\d+(?:\.\d+)?\s*pp\b/gi,
  /\s*\b\d+(?:\.\d+)?\s*(?:\*|★|☆|⭐️?|stars?\b)/giu,
];
// Shapes that mark a whole tag as noise but may stand in a song name outside one.
const TAG_SHAPES = [/\b\d{3,4}p\b/i, /\b\d+\s*fps\b/i, /^\s*\d+k\s*$/i, /\b(?:19|20)\d{2}\b/];
const SHAPE_TESTS = [...SHAPES, ...TAG_SHAPES].map((r) => new RegExp(r.source, r.flags.replace('g', '')));

// A credit clause, bracketed ("(feat. X)", "(with X)", "(w/ X)") or not ("ft. X").
const FEAT_OPEN = /^\s*(?:feat\.?|ft\.|featuring|with|w\/)\s/i;
const UNBRACKETED_FEAT = /(^|\s)((?:feat\.?|ft\.|featuring)\s+.+?)(?=\s+[-–—|/•]\s|\s*$)/i;

const SYMBOLS = '\\+\\~\\|\\/•★☆_#:*\\-';
const TRAILING_SYMBOLS = new RegExp(`\\s*[${SYMBOLS}]+\\s*$`);
const LEADING_SYMBOLS = new RegExp(`^[${SYMBOLS}]+\\s*`);

const collapseWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const trimSymbols = (text) => collapseWhitespace(text).replace(TRAILING_SYMBOLS, '').replace(LEADING_SYMBOLS, '').trim();
const hasLetters = (text) => /[\p{L}\p{N}]/u.test(String(text || ''));
const tagKey = (content) => collapseWhitespace(String(content).normalize('NFKC').toLowerCase());

// An Artist/Title separator is a separator char that whitespace touches on at least one side,
// and the title after it may not open with another separator char. An unspaced ":" or "-" is
// part of a name ("Re:Re:", "KUNG-FU", "Re:Zero"), not a split point, and in "Re:Re: - X" the
// colon run is skipped so the split lands on the spaced dash.
const splitSeparator = (chars) => `(?:\\s+[${chars}]\\s*|\\s*[${chars}]\\s+)(?![\\s${chars}])`;
// "Artist - Title", "Artist | Title", "Artist : Title", "Artist • Title", "Artist _ Title"
const STANDARD_SPLIT = new RegExp(`^(.+?)${splitSeparator('\\-:—–|•')}(.+)$`);
const SPACED_UNDERSCORE_SPLIT = /^(.+?)\s+_\s+(.+)$/;
const DASH_SPLIT = new RegExp(`^(.+?)${splitSeparator('\\-—–')}(.+)$`);
const BY_SPLIT = /^(.+?)\s+by\s+(.+)$/i;
const PIPE = /\s+\|\s*|\s*\|\s+/;

function matchBracket(s, i, open, close) {
  let depth = 0;
  for (let j = i; j < s.length; j += 1) {
    if (s[j] === open && open !== close) depth += 1;
    else if (s[j] === close) {
      depth -= 1;
      if (depth <= 0) return j;
    }
  }
  return -1;
}

// A single quote opens a quote only at a word boundary, so "Earth's" and "I'm" never do.
function singleQuoteEnd(s, i, close) {
  const before = i === 0 ? ' ' : s[i - 1];
  if (!/[\s(\[【「『]/.test(before) || !s[i + 1] || /\s/.test(s[i + 1])) return -1;
  for (let j = i + 2; j < s.length; j += 1) {
    if (s[j] !== close && !(close === "'" && s[j] === '’')) continue;
    const next = s[j + 1];
    if (!/\s/.test(s[j - 1]) && (next === undefined || /[\s\p{P}\p{S}]/u.test(next))) return j;
  }
  return -1;
}

/**
 * Parses a title into text and tag parts. It removes nothing: `parts.map(p => p.raw).join('')`
 * is the input. A tag records its kind ('bracket' or 'quote'), its open and close marks and
 * its content.
 */
export function parseTitleTags(text) {
  const s = String(text ?? '');
  const parts = [];
  let buffer = '';
  const flush = () => {
    if (buffer) parts.push({ kind: 'text', raw: buffer });
    buffer = '';
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    let end = -1;
    let kind = null;
    if (BRACKET_PAIRS[ch]) {
      end = matchBracket(s, i, ch, BRACKET_PAIRS[ch]);
      kind = QUOTE_BRACKETS.has(ch) ? 'quote' : 'bracket';
    } else if (DOUBLE_QUOTES[ch]) {
      end = s.indexOf(DOUBLE_QUOTES[ch], i + 1);
      kind = 'quote';
    } else if (SINGLE_QUOTES[ch]) {
      end = singleQuoteEnd(s, i, SINGLE_QUOTES[ch]);
      kind = 'quote';
    }
    if (end > i) {
      flush();
      parts.push({ kind, open: ch, close: s[end], content: s.slice(i + 1, end), raw: s.slice(i, end + 1) });
      i = end + 1;
    } else {
      buffer += ch;
      i += 1;
    }
  }
  flush();
  return parts;
}

/** Splits unbracketed "feat. X" clauses out of the text parts as tags of their own. */
function splitFeatClauses(parts) {
  const out = [];
  for (const part of parts) {
    if (part.kind !== 'text') { out.push(part); continue; }
    let rest = part.raw;
    let m;
    while ((m = rest.match(UNBRACKETED_FEAT))) {
      const at = m.index + m[1].length;
      if (at > 0) out.push({ kind: 'text', raw: rest.slice(0, at) });
      out.push({ kind: 'feat', open: '', close: '', content: m[2], raw: m[2] });
      rest = rest.slice(at + m[2].length);
    }
    if (rest) out.push({ kind: 'text', raw: rest });
  }
  return out;
}

function isShape(content) {
  return SHAPE_TESTS.some((r) => r.test(content));
}

function stripShapes(text) {
  let out = text;
  for (const r of SHAPES) out = out.replace(r, '');
  return out;
}

/** Word tokens with their offsets, compared case and width insensitively. */
function tokens(text) {
  return [...String(text || '').matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    key: m[0].normalize('NFKC').toLowerCase(),
    start: m.index,
    end: m.index + m[0].length,
  }));
}

const runAt = (hay, needle) => {
  for (let i = 0; i + needle.length <= hay.length; i += 1) {
    if (needle.every((t, k) => hay[i + k].key === t.key)) return true;
  }
  return false;
};

// A run of tokens echoes a name when it is the whole name, or a run inside it with a token of
// three or more characters. Two letters ("OP", "MV") inside a longer name are too little.
function runEchoes(run, name) {
  if (!run.length || !name.length) return false;
  if (run.length === name.length && runAt(name, run)) return true;
  return run.some((t) => [...t.key].length >= 3) && runAt(name, run);
}

function echoesAny(text, names) {
  const run = tokens(text);
  return names.some((name) => runEchoes(run, tokens(name)));
}

/** The longest run of `text` that echoes one of `names`, as the original substring. */
function echoRun(text, names) {
  const toks = tokens(text);
  for (let len = toks.length; len > 0; len -= 1) {
    for (let i = 0; i + len <= toks.length; i += 1) {
      const run = toks.slice(i, i + len);
      if (names.some((name) => runEchoes(run, tokens(name)))) {
        return len === toks.length ? text.trim() : text.slice(run[0].start, run[len - 1].end);
      }
    }
  }
  return null;
}

// A tag that holds a whole name and more is a credit to that name ("(The Glitch Mob Remix)"
// on The Glitch Mob's channel), which is part of what the song is called.
function creditsAny(text, names) {
  const run = tokens(text);
  return names.some((name) => {
    const n = tokens(name);
    return n.length > 0 && run.length > n.length && runAt(run, n);
  });
}

const playlistMemo = new WeakMap();

/** The tag keys one raw title carries: every bracketed tag with letters. */
function titleTagKeys(title) {
  const seen = new Set();
  for (const part of parseTitleTags(title)) {
    if (part.kind === 'bracket' && hasLetters(part.content)) seen.add(tagKey(part.content));
  }
  return seen;
}

/**
 * Counts, across a playlist's raw titles, how many tracks carry each tag (bracketed, or a
 * leading "X ~ " head). A tag on two or more tracks ("[Monstercat Release]", "【Vietsub +
 * Kara】") is the uploader's house style, not part of any one song's name. Call once per
 * playlist and pass the result to cleanSongTitle as `playlistTitles`.
 * @param {string[]} titles
 * @returns {Map<string, number>}
 */
export function cleanPlaylistTitles(titles) {
  const counts = new Map();
  for (const title of titles || []) {
    for (const key of titleTagKeys(title)) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function playlistCounts(value) {
  if (value instanceof Map) return value;
  if (!Array.isArray(value)) return new Map();
  if (!playlistMemo.has(value)) playlistMemo.set(value, cleanPlaylistTitles(value));
  return playlistMemo.get(value);
}

/**
 * How strongly a tag leans noise. Infinity is certain noise (stripped from both hypotheses);
 * 1 or more is stripped from H0 and kept in H1; 0 or less is kept in both.
 */
function tagLean(tag, ctx) {
  const content = tag.content;
  if (!hasLetters(content) || isShape(content)) return Infinity;
  const names = [...ctx.channels, ctx.artist].filter(Boolean);
  if (echoesAny(content, names)) return Infinity;
  let lean = 0;
  if (tag.kind === 'feat' || FEAT_OPEN.test(content)) lean += 2;
  if (tag.kind === 'bracket' && !ROUND_BRACKETS.has(tag.open)) lean += 1;
  if (!ctx.structured) lean += tag.leading || tag.trailing ? 1 : -1;
  if ((ctx.playlist.get(tagKey(content)) || 0) >= 2) lean += 2;
  if (creditsAny(content, names)) lean -= 2;
  return lean;
}

/**
 * Renders a stretch of the working string. mode 'h0' drops every tag that leans noise, 'h1'
 * drops only certain noise, 'artist' drops every tag (a bracket beside an artist is an alias
 * or a label, never the artist).
 */
function render(work, items, ctx, mode) {
  const out = work.replace(PLACEHOLDER_RUN, (ch) => {
    const item = items[placeholderIndex(ch)];
    if (!item) return '';
    if (item.kind === 'quote') {
      if (QUOTE_BRACKETS.has(item.open) && mode !== 'artist') return item.raw;
      return item.open === "'" || item.open === '‘' ? (mode === 'artist' ? item.content : item.raw) : item.content;
    }
    if (mode === 'artist') return ' ';
    const lean = tagLean(item, ctx);
    if (lean === Infinity || (mode === 'h0' && lean >= 1)) return ' ';
    return item.raw;
  });
  return trimSymbols(out);
}

/** Builds the working string: shapes removed from text, every tag a placeholder. */
function buildWork(rawTitle) {
  const items = [];
  let work = '';
  for (const part of splitFeatClauses(parseTitleTags(rawTitle))) {
    if (part.kind === 'text') {
      work += stripShapes(part.raw);
    } else {
      items.push({ ...part });
      work += placeholderAt(items.length - 1);
    }
  }
  work = trimSymbols(work);
  // Position is read on the whole title: leading is nothing but tags before it; trailing is
  // nothing but tags and symbols after it, up to the end or the next spaced separator.
  const onlyTags = new RegExp(`^[\\s${PLACEHOLDER_CLASS}]*$`);
  const tailNoise = new RegExp(`^[\\s${PLACEHOLDER_CLASS}${SYMBOLS}]*$`);
  for (let i = 0; i < work.length; i += 1) {
    const item = items[placeholderIndex(work[i])];
    if (!item || work[i].charCodeAt(0) < PLACEHOLDER_BASE) continue;
    const before = work.slice(0, i);
    const after = work.slice(i + 1).split(/\s[-–—|/~•]\s/)[0];
    item.leading = onlyTags.test(before);
    item.trailing = tailNoise.test(after);
  }
  return { work, items };
}

const firstPlaceholder = (text, items, kind) => {
  for (let i = 0; i < text.length; i += 1) {
    const item = items[placeholderIndex(text[i])];
    if (text[i].charCodeAt(0) >= PLACEHOLDER_BASE && item && item.kind === kind) return i;
  }
  return -1;
};

const sameName = (a, b) => Boolean(a) && Boolean(b) && tagKey(a) === tagKey(b);

/**
 * Clean a song/video title into an osu!-friendly search query with rich fallbacks.
 * @param {string} rawTitle - Raw title from YouTube / Spotify / Apple Music
 * @param {string} [channelTitle] - Optional channel name / artist
 * @param {object} [options]
 * @param {string} [options.source] - Where the title came from ('spotify', 'apple', 'youtube', 'query')
 * @param {string} [options.providerArtist] - The provider's own artist field, when it has one.
 *   When non-empty, no artist is ever split out of the title: it is returned as the artist
 *   (whitespace normalized only), and only the part before a spaced dash is H0's title.
 * @param {Map<string, number>|string[]} [options.playlistTitles] - The playlist's tag counts
 *   from cleanPlaylistTitles, or its raw titles.
 *
 * `artistFromTitle` is true only when the returned artist was split out of the title text,
 * never when it is the provider's artist or the channel name. `altTitle` is H1 when it
 * differs from `title`, else ''.
 */
export function cleanSongTitle(rawTitle, channelTitle = '', { source, providerArtist, playlistTitles } = {}) {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return { cleanQuery: '', artist: '', title: '', altTitle: '', fallbacks: [], queries: [], artistFromTitle: false };
  }

  const structuredArtist = collapseWhitespace(providerArtist);

  // Clean channel name
  const cleanChannel = (channelTitle || '')
    .replace(/ - Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/Official Channel$/i, '')
    .replace(/Official$/i, '')
    .replace(/Music$/i, '')
    .replace(/Records$/i, '')
    .replace(/\s*ch\.\s*【.*?】/gi, '')
    .replace(/\s*【.*?】/g, '')
    .trim();

  const ctx = {
    structured: Boolean(structuredArtist),
    channels: [channelTitle, cleanChannel, structuredArtist].filter(Boolean),
    artist: structuredArtist,
    playlist: playlistCounts(playlistTitles),
  };
  const built = buildWork(rawTitle);
  const { items } = built;
  let work = built.work;

  let artist = '';
  let titleWork = work;
  let altWork = work;
  let promoted = null;
  let artistFromTitle = false;
  let kind = 'plain';
  const tailSegments = [];

  if (ctx.structured) {
    // The provider's artist field is the artist; nothing in the title is split off as one.
    // H0 is the part before a spaced dash (a version, edit or source credit); H1 is all of it.
    artist = structuredArtist;
    const dash = work.match(DASH_SPLIT);
    titleWork = dash ? dash[1] : work;
    kind = 'structured';
  } else {
    // Leading tags that lean noise go first, with any separator after them ("[Genre] - ").
    // One that is not certain noise is remembered: when no artist split follows, it opened
    // the title itself ("(Don't Fear) The Reaper") and H1 keeps it.
    let leadingKept = '';
    for (;;) {
      const m = work.match(new RegExp(`^\\s*([${PLACEHOLDER_CLASS}])\\s*`));
      const item = m && items[placeholderIndex(m[1])];
      if (!item || item.kind === 'quote') break;
      const lean = tagLean(item, ctx);
      if (lean < 1) break;
      if (lean !== Infinity) leadingKept += `${m[1]} `;
      work = work.slice(m[0].length).replace(LEADING_SYMBOLS, '');
    }

    // A leading "X ~ " that is the channel's own name is the uploader, not the song.
    const tilde = work.match(/^(.+?)\s+~\s+(.+)$/);
    if (tilde) {
      const head = render(tilde[1], items, ctx, 'artist');
      if (echoesAny(head, ctx.channels)) work = tilde[2];
    }

    // Pipe segments: when one of them splits into Artist and Title, it is the song and the
    // others ("Player |", "| Trap Nation") are tags. With no such segment the pipe itself is
    // the separator, less any segment that is the channel's name.
    const segments = work.split(PIPE).map((s) => s.trim()).filter((s) => hasLetters(s.replace(PLACEHOLDER_RUN, 'x')));
    if (segments.length > 1) {
      const main = segments.findIndex((s) => STANDARD_SPLIT.test(s) || BY_SPLIT.test(s));
      if (main >= 0) {
        for (const s of segments.slice(main + 1)) tailSegments.push({ sep: ' | ', work: s });
        work = segments[main];
      } else {
        work = segments.filter((s) => !echoesAny(render(s, items, ctx, 'artist'), ctx.channels)).join(' | ');
      }
    }

    // A spaced " / " tail: the channel's name there is the artist (when nothing else is),
    // anything else is a tag.
    let slashArtist = '';
    const slash = work.match(/^(.+)\s+\/\s+(.+)$/);
    if (slash) {
      const right = render(slash[2], items, ctx, 'artist');
      if (echoesAny(right, ctx.channels)) {
        if (!STANDARD_SPLIT.test(slash[1]) && !BY_SPLIT.test(slash[1])) slashArtist = right;
      } else {
        tailSegments.unshift({ sep: ' / ', work: slash[2] });
      }
      work = slash[1];
    } else if (!STANDARD_SPLIT.test(work)) {
      // An unspaced "Title/Artist" counts only when one side is exactly the channel.
      const tight = work.match(/^([^/]+)\/([^/]+)$/);
      if (tight) {
        const [left, right] = [render(tight[1], items, ctx, 'artist'), render(tight[2], items, ctx, 'artist')];
        if (ctx.channels.some((c) => sameName(c, right))) { slashArtist = right; work = tight[1]; }
        else if (ctx.channels.some((c) => sameName(c, left))) { slashArtist = left; work = tight[2]; }
      }
    }

    // Quote promotion: 「」, 『』 or quote marks around the song name, when they are the
    // whole title, sit in the artist part, or open the title part.
    const split = slashArtist ? null : (work.match(STANDARD_SPLIT) || work.match(SPACED_UNDERSCORE_SPLIT));
    const q = slashArtist ? -1 : firstPlaceholder(work, items, 'quote');
    if (q >= 0) {
      let before = null;
      let after = '';
      if (!split) {
        before = work.slice(0, q);
        after = work.slice(q + 1);
      } else if (q < split[1].length) {
        before = work.slice(0, q);
        after = work.slice(q + 1);
      } else if (render(split[2], items, ctx, 'artist') !== '' && firstPlaceholder(split[2], items, 'quote') === split[2].search(/\S/)) {
        artist = render(split[1], items, ctx, 'artist');
        before = '';
      }
      if (before !== null) {
        promoted = items[placeholderIndex(work[q])];
        if (!artist) {
          const named = render(before, items, ctx, 'artist');
          const tail = after.replace(PLACEHOLDER_RUN, '').trim();
          if (hasLetters(named)) artist = echoRun(named, ctx.channels) || named;
          else if (new RegExp(`^[${SYMBOLS}—–•]`).test(tail)) artist = render(after.replace(/^\s*[-:—–|•/]\s*/, ''), items, ctx, 'artist');
        }
        artistFromTitle = Boolean(artist);
        kind = artist ? 'split' : 'plain';
      }
    }

    if (!promoted) {
      if (slashArtist) {
        artist = slashArtist;
        artistFromTitle = true;
        kind = 'split';
        titleWork = work;
      } else if (split) {
        artist = render(split[1], items, ctx, 'artist');
        titleWork = split[2];
        artistFromTitle = true;
        kind = 'split';
      } else {
        const by = work.match(BY_SPLIT);
        if (by) {
          titleWork = by[1];
          artist = render(by[2], items, ctx, 'artist');
          artistFromTitle = true;
          kind = 'split';
        } else {
          titleWork = work;
        }
      }
      const wasSplit = kind === 'split';
      // A second spaced dash in the title part ("Shelter - Live at Second Sky") is a tag.
      const second = titleWork.match(DASH_SPLIT);
      if (wasSplit && second) {
        tailSegments.unshift({ sep: ' - ', work: second[2] });
        titleWork = second[1];
      }
      // So is a spaced " ~ " there ("Song ~ Night Ver."): H1 keeps it, and when a map carries
      // the fuller title ("Lunatic Eyes ~ Invisible Full Moon") the fuller match wins at search.
      const wave = wasSplit ? titleWork.match(/^(.+?)\s+~\s+(.+)$/) : null;
      if (wave && hasLetters(wave[1].replace(PLACEHOLDER_RUN, ''))) {
        tailSegments.unshift({ sep: ' ~ ', work: wave[2] });
        titleWork = wave[1];
      }
      altWork = kind === 'plain' && !wasSplit && leadingKept ? `${leadingKept}${titleWork}` : titleWork;
    }
    ctx.artist = artist;
  }

  let title;
  let altTitle;
  if (promoted) {
    title = trimSymbols(promoted.content);
    altTitle = title;
  } else {
    title = render(titleWork, items, ctx, 'h0');
    altTitle = render(altWork, items, ctx, 'h1');
    for (const seg of tailSegments) {
      const text = render(seg.work, items, ctx, 'h1');
      if (hasLetters(text) && !echoesAny(text, [...ctx.channels, artist].filter(Boolean))) altTitle += `${seg.sep}${text}`;
    }
  }
  // Keep a letter floor: a title of nothing but tags falls back to the tags.
  if (!hasLetters(title)) {
    const bare = trimSymbols(built.work.replace(PLACEHOLDER_RUN, (ch) => ` ${items[placeholderIndex(ch)]?.content ?? ''} `).replace(/\s+/g, ' '));
    title = [bare, altTitle].find(hasLetters) || '';
  }

  if (!structuredArtist) artist = trimSymbols(artist);
  const queries = [];
  if (kind === 'structured') {
    queries.push(`${artist} ${title}`);
    queries.push(title);
  } else if (kind === 'split') {
    queries.push(`${artist} ${title}`);
    queries.push(title);
    queries.push(`${title} ${artist}`);
    if (!promoted && cleanChannel && cleanChannel.toLowerCase() !== artist.toLowerCase()) {
      queries.push(`${cleanChannel} ${title}`);
    }
  } else {
    if (cleanChannel) {
      artist = cleanChannel;
      queries.push(`${cleanChannel} ${title}`);
    }
    queries.push(title);
  }

  // If title has a subtitle in ~ or - (e.g. "Song Name ~Subtitle~" -> "Song Name")
  const subMatch = title.match(/^(.+?)\s*[~–—]\s*.+?\s*[~–—]?$/);
  if (subMatch && subMatch[1].trim().length >= 3) {
    const mainTitle = trimSymbols(subMatch[1]);
    if (artist) queries.push(`${artist} ${mainTitle}`);
    queries.push(mainTitle);
  }

  const cleanFinalTitle = collapseWhitespace(title);
  const cleanFinalArtist = collapseWhitespace(artist || cleanChannel || '');
  const cleanAltTitle = collapseWhitespace(altTitle);

  const uniqueQueries = Array.from(new Set(queries.map((q) => collapseWhitespace(q)).filter((q) => q.length > 0)));
  const cleanQuery = uniqueQueries[0] || (cleanFinalArtist ? `${cleanFinalArtist} - ${cleanFinalTitle}` : cleanFinalTitle);

  return {
    cleanQuery,
    artist: cleanFinalArtist,
    title: cleanFinalTitle,
    altTitle: cleanAltTitle && tagKey(cleanAltTitle) !== tagKey(cleanFinalTitle) ? cleanAltTitle : '',
    raw: rawTitle,
    fallbacks: uniqueQueries.slice(1),
    queries: uniqueQueries,
    // An empty split falls back to the channel, which is not from the title.
    artistFromTitle: artistFromTitle && Boolean(artist) && kind === 'split',
  };
}
