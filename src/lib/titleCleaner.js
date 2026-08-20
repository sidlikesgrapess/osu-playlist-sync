/**
 * Cleans song and YouTube video titles to extract pure song and artist names
 * for maximum accuracy when querying the osu! API.
 */

// Terms that indicate an entire bracketed segment (parentheses, square brackets, Japanese brackets) is noise
const BRACKET_NOISE_TERMS = [
  'official', 'music video', 'music', 'video', 'audio', 'visualizer', 'mv', 'pv', 'hd', 'hq', '4k', '1080p', '720p',
  '60fps', 'lyrics', 'lyric', 'full song', 'full ver', 'full version', 'short ver', 'short version',
  'original mix', 'extended mix', 'club mix', 'radio edit', 'remaster', 'remastered', 'cover', 'ost', 'soundtrack',
  'theme song', 'audio track', 'color coded', 'color-coded', 'cc',
  'tv size', 'tv-size', 'tv ver', 'tv version', 'tv edit', 'anime', 'opening', 'ending', 'op', 'ed', 'insert song', 'season',
  'nightcore', 'daycore', 'sped up', 'speed up', 'slowed', 'reverb', '8d audio', 'bass boosted', 'acoustic', 'instrumental', 'off vocal', 'karaoke',
  'extra', 'expert', 'insane', 'hard', 'normal', 'easy', 'extreme', 'master', 'top diff', 'collab', 'four dimensions',
  'inner oni', 'ura oni', 'oni', 'muzukashii', 'futsuu', 'kantan', 'overdose', 'rain', 'platter', 'salad', 'cup', 'gravity', 'tatsujin',
  'replay', 'liveplay', 'mapset', 'beatmap', 'diff', 'difficulty', 'mapped by', 'mapper', 'prod.', 'produced by',
  'live', 'clip', 'fc', 'ss', 'stream', 'release',
  '歌ってみた', 'オリジナル', 'original', '東方', '東方project', 'フル', 'ハイレゾ', '高音質', '作業用bgm', '試聴動画',
];

// Regex constructed to match bracket pairs containing noise keywords or pattern matches (e.g. 727pp, 8.5*, 4K, 1080p)
const BRACKET_PATTERN = /\s*([\[\(\【\「『〖〔《])\s*([^\]\)\】\」』〗〕》]+)\s*([\]\)\】\」』〗〕》])/gi;

// Inline noise patterns to strip anywhere in text
const INLINE_NOISE_PATTERNS = [
  // osu! mods e.g. +HDHR, +HDDT, +EZ, +HR, +DT, +NC, +FL, +DTHR, +EZHD, etc.
  /\s*\+\s*(?:HD|HR|DT|NC|FL|EZ|HT|SO|NF|TD|NM|RX|AP|V2|AT|HDHR|HDDT|DTHR|EZHD|EZDT|FLHD|HRDT|HDNC)+\b/gi,

  // osu! hits & misses e.g. 6x100, 1xmiss, 2x50, 0x100, 100x100, 1xsliderbreak, 0xmiss
  /\s*\b\d+x(?:100|50|miss|misses|sb|sliderbreak)\b/gi,

  // Accuracies e.g. 99.45% FC, 100% SS, 98.5%
  /\s*\b\d{1,3}(?:\.\d{1,2})?%\s*(?:FC|SS|S|A)?\b/gi,

  // PP values e.g. 727pp, 1000pp
  /\s*\b\d+(?:\.\d+)?\s*pp\b/gi,

  // Star ratings e.g. 8.5*, 7.23★, 8.5 stars
  /\s*\b\d+(?:\.\d+)?\s*(?:\*|★|☆|\bstars?\b)/gi,

  // Standalone mod/combo words at end
  /\s*\b(?:FC|SS|S Rank|Silver SS|Silver S|First FC|World Record|WR)\b/gi,

  // Standalone release words
  /\b(?:official\s+lyric\s+video|official\s+music\s+video|official\s+video|official\s+audio|lyric\s+video|music\s+video|official\s+visualizer|visualizer)\b/gi,
  /\b(?:\d{4}\s*remaster|remastered\s*\d{4})\b/gi,
  /\b(?:free\s+download|free\s+dl|stream\s+now|out\s+now|audio\s+only)\b/gi,
  /\b(?:sped\s*up|speed\s*up|slowed\s*\+\s*reverb|slowed\s*down|nightcore|daycore|8d\s*audio|bass\s*boosted)\b/gi,
];

// Well-known original artists for iconic songs
const KNOWN_SONG_ARTISTS = {
  'the kill': '30 Seconds to Mars',
  'the kill bury me': '30 Seconds to Mars',
  'i hate everything about you': 'Three Days Grace',
  'iris': 'Goo Goo Dolls',
  'all i wanted': 'Paramore',
};

/**
 * Strips symbols and noise trailing after a song name (e.g. "Song Name +HDHR 6x100" or "Song Name • Official Visualizer")
 */
function stripTrailingSymbolNoise(text) {
  if (!text) return '';
  let cleaned = text;

  // 1. Strip trailing + followed by anything (mods, hits, speedup, reverb, etc.)
  cleaned = cleaned.replace(/\s*\+.*$/i, '');

  // 2. Strip anything following a symbol like ~ or • or | or / or ★ when it represents noise/effects
  cleaned = cleaned.replace(/\s*[\~•★☆|/]\s*(?:HD|HR|DT|NC|FL|EZ|HT|SO|NF|TD|NM|\d+x|\d+pp|\d+★|\d+\*|Nightcore|Daycore|Sped|Speed|Slowed|Reverb|Audio|Official|MV|PV|Cover|Remix|Edit|Live|prod\.|sub-?title).*$/i, '');

  // 3. Strip standalone trailing symbols: + ~ | / • ★ ☆ _ # : * -
  cleaned = cleaned.replace(/\s*[\+\~\|\/•★☆_#:*\-]+\s*$/g, '');

  // 4. Strip leading symbols
  cleaned = cleaned.replace(/^[\+\~\|\/•★☆_#:*\-]+\s*/g, '');

  return cleaned.trim();
}

/**
 * Strips bracketed segments if their contents match noise indicators
 */
function stripBracketNoise(text) {
  let cleaned = text;

  // Pass 1: Check each bracket pair
  cleaned = cleaned.replace(BRACKET_PATTERN, (match, open, content, close) => {
    const lowerContent = content.toLowerCase();
    
    // Check if bracket contains any known noise term
    const isNoiseTerm = BRACKET_NOISE_TERMS.some(term => lowerContent.includes(term));
    
    // Check regex patterns for PP, star rating, osu! mods, year, accuracy, resolution
    const isPatternNoise = 
      /\b\d+pp\b/i.test(lowerContent) ||
      /\b\d+(?:\.\d+)?\s*(?:\*|★|☆|stars?)/i.test(lowerContent) ||
      /\b\d{3,4}p\b/i.test(lowerContent) || // 1080p, 720p, 4k
      /\b\d+fps\b/i.test(lowerContent) ||
      /\b\d{1,3}(?:\.\d+)?%/i.test(lowerContent) ||
      /\b\d{4}\b/.test(lowerContent) || // 2012, 2024
      /^\d+k$/i.test(lowerContent.trim()) || // 4K, 7K
      /^(?:fc|ss|replay|liveplay)$/i.test(lowerContent.trim()) ||
      /^(?:prod\.|produced by)/i.test(lowerContent.trim()) ||
      /\+(?:HD|HR|DT|NC|FL|EZ|HT|SO|NF|TD|NM)+/i.test(lowerContent);

    if (isNoiseTerm || isPatternNoise) {
      return '';
    }
    return match;
  });

  return cleaned;
}

/**
 * Clean a song/video title into an osu!-friendly search query with rich fallbacks.
 * @param {string} rawTitle - Raw title from YouTube / Spotify / Apple Music
 * @param {string} [channelTitle] - Optional channel name / artist
 */
export function cleanSongTitle(rawTitle, channelTitle = '') {
  if (!rawTitle || typeof rawTitle !== 'string') {
    return { cleanQuery: '', artist: '', title: '', fallbacks: [], queries: [] };
  }

  // Clean channel name
  let cleanChannel = (channelTitle || '')
    .replace(/ - Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/Official Channel$/i, '')
    .replace(/Official$/i, '')
    .replace(/Music$/i, '')
    .replace(/Records$/i, '')
    .replace(/\s*ch\.\s*【.*?】/gi, '')
    .replace(/\s*【.*?】/g, '')
    .trim();

  let text = rawTitle;

  // 1. Strip prefix tags like [MV], 【MV】, [Official], etc.
  text = text.replace(/^[【\[\(][^】\]\)]+[】\]\)]\s*/, '');

  // 2. Strip bracket noise
  text = stripBracketNoise(text);

  // 3. Strip inline noise
  for (const pattern of INLINE_NOISE_PATTERNS) {
    text = text.replace(pattern, '');
  }

  // 4. Strip trailing symbol noise
  text = stripTrailingSymbolNoise(text);

  // 5. Check if title had quotes e.g. "Sound Asleep" - Chikafuji Lisa or Artist "Song Title"
  let quotedTitle = null;
  const quoteMatch1 = text.match(/^["“](.+?)["”]\s*[-:—–/|]\s*(.+)$/);
  const quoteMatch2 = text.match(/^(.+?)\s*[-:—–/|]\s*["“](.+?)["”]$/);
  if (quoteMatch1) {
    quotedTitle = {
      title: quoteMatch1[1].trim(),
      artist: quoteMatch1[2].trim(),
    };
  } else if (quoteMatch2) {
    quotedTitle = {
      artist: quoteMatch2[1].trim(),
      title: quoteMatch2[2].trim(),
    };
  }

  text = text.replace(/["“”]/g, '').trim();

  // Strip empty/leftover brackets e.g. () or [] or 【】
  text = text.replace(/\s*[\(\[【「『〖〔《]\s*[\)\]】」』〗〕》]/g, '').trim();

  // Clean trailing punctuation
  text = stripTrailingSymbolNoise(text);

  let artist = '';
  let title = text;
  const queries = [];

  if (quotedTitle) {
    title = stripTrailingSymbolNoise(quotedTitle.title);
    artist = stripTrailingSymbolNoise(quotedTitle.artist);
    queries.push(`${artist} ${title}`);
    queries.push(title);
    queries.push(`${title} ${artist}`);
  } else {
    // Pattern A: "Title - Artist / Covered by CoverArtist" or "Title - Artist | Cover by CoverArtist"
    const coverMatch1 = text.match(/^(.+?)\s*[-:—–]\s*(.+?)\s*[/|•]\s*(?:covered by|cover by|cover)\s*(.+)$/i);
    // Pattern B: "Title by Artist | Covered by CoverArtist"
    const coverMatch2 = text.match(/^(.+?)\s+by\s+(.+?)\s*[/|•]\s*(?:covered by|cover by|cover)\s*(.+)$/i);
    // Pattern C: "Artist - Title" or "Artist / Title" or "Artist | Title" or "Artist : Title"
    const standardMatch = text.match(/^(.+?)\s*[-:—–|•]\s*(.+)$/);
    // Pattern D: "Title by Artist"
    const byMatch = text.match(/^(.+?)\s+by\s+(.+)$/i);

    if (coverMatch1) {
      title = stripTrailingSymbolNoise(coverMatch1[1]);
      artist = stripTrailingSymbolNoise(coverMatch1[2]);
      queries.push(`${artist} ${title}`);
      queries.push(title);
      queries.push(`${title} ${artist}`);
    } else if (coverMatch2) {
      title = stripTrailingSymbolNoise(coverMatch2[1]);
      artist = stripTrailingSymbolNoise(coverMatch2[2]);
      queries.push(`${artist} ${title}`);
      queries.push(title);
      queries.push(`${title} ${artist}`);
    } else if (standardMatch) {
      artist = stripTrailingSymbolNoise(standardMatch[1]);
      title = stripTrailingSymbolNoise(standardMatch[2]);
      queries.push(`${artist} ${title}`);
      queries.push(title);
      queries.push(`${title} ${artist}`);
      if (cleanChannel && cleanChannel.toLowerCase() !== artist.toLowerCase()) {
        queries.push(`${cleanChannel} ${title}`);
      }
    } else if (byMatch) {
      title = stripTrailingSymbolNoise(byMatch[1]);
      artist = stripTrailingSymbolNoise(byMatch[2]);
      queries.push(`${artist} ${title}`);
      queries.push(title);
      queries.push(`${title} ${artist}`);
    } else {
      title = stripTrailingSymbolNoise(text);
      if (cleanChannel) {
        artist = cleanChannel;
        queries.push(`${cleanChannel} ${title}`);
      }
      queries.push(title);
    }
  }

  // Remove featuring info for cleaner secondary queries e.g. "Song (feat. Drake)" -> "Song"
  const baseTitle = stripTrailingSymbolNoise(
    title.replace(/\s*\((?:feat\.|ft\.|featuring).*?\)/gi, '')
         .replace(/\s*\[(?:feat\.|ft\.|featuring).*?\]/gi, '')
         .trim()
  );

  if (baseTitle && baseTitle !== title) {
    if (artist) queries.push(`${artist} ${baseTitle}`);
    queries.push(baseTitle);
  }

  // If title has a subtitle in ~ or - (e.g. "Song Name ~Subtitle~" -> "Song Name")
  const subMatch = (baseTitle || title).match(/^(.+?)\s*[\~–—]\s*.+?\s*[\~–—]?$/);
  if (subMatch && subMatch[1].trim().length >= 3) {
    const mainTitle = stripTrailingSymbolNoise(subMatch[1]);
    if (artist) queries.push(`${artist} ${mainTitle}`);
    queries.push(mainTitle);
  }

  // Check known iconic song artists
  const normTitle = (baseTitle || title).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const shortTitle = normTitle.replace(/\s+bury me$/, '').trim();
  
  if (KNOWN_SONG_ARTISTS[normTitle]) {
    queries.unshift(`${KNOWN_SONG_ARTISTS[normTitle]} ${baseTitle || title}`);
  } else if (KNOWN_SONG_ARTISTS[shortTitle]) {
    queries.unshift(`${KNOWN_SONG_ARTISTS[shortTitle]} ${baseTitle || title}`);
  }

  // Normalize spaces
  const cleanFinalTitle = (baseTitle || title).replace(/\s+/g, ' ').trim();
  const cleanFinalArtist = (artist || cleanChannel || '').replace(/\s+/g, ' ').trim();

  const uniqueQueries = Array.from(
    new Set(
      queries
        .map(q => q.replace(/\s+/g, ' ').trim())
        .filter(q => q.length > 0)
    )
  );

  // Primary clean query:
  // If the title alone is complete or artist is known
  const cleanQuery = uniqueQueries[0] || (cleanFinalArtist ? `${cleanFinalArtist} - ${cleanFinalTitle}` : cleanFinalTitle);

  return {
    cleanQuery,
    artist: cleanFinalArtist,
    title: cleanFinalTitle,
    raw: rawTitle,
    fallbacks: uniqueQueries.slice(1),
    queries: uniqueQueries,
  };
}

export default cleanSongTitle;
