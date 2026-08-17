/**
 * Cleans YouTube video titles to extract pure song and artist names
 * for maximum accuracy when querying the osu! API.
 */

// Noise patterns to strip away from titles
const NOISE_PATTERNS = [
  /\s*\[\s*(official\s*(music\s*)?video|official\s*audio|official\s*lyric\s*video|official\s*visualizer|lyric\s*video|music\s*video|mv|pv|hd|hq|4k|60fps|lyrics?|full\s*song|visualizer|audio|ost|extended|remastered|cover)\s*\]/gi,
  /\s*\(\s*(official\s*(music\s*)?video|official\s*audio|official\s*lyric\s*video|official\s*visualizer|lyric\s*video|music\s*video|mv|pv|hd|hq|4k|60fps|lyrics?|full\s*song|visualizer|audio|ost|extended|remastered|cover)\s*\)/gi,
  /\s*【\s*(official\s*(music\s*)?video|mv|pv|hd|hq|lyrics?|歌ってみた|オリジナル|original)\s*】/gi,
  /\s*「\s*(official\s*(music\s*)?video|mv|pv|hd|hq|lyrics?)\s*」/gi,
  /\s*\|\s*official\s*(music\s*)?video/gi,
  /\s*\|\s*official\s*audio/gi,
  /\s*-\s*official\s*(music\s*)?video/gi,
  /\s*-\s*official\s*audio/gi,
  /\b(official\s+lyric\s+video|official\s+music\s+video|official\s+video|official\s+audio|lyric\s+video|music\s+video|official\s+visualizer|visualizer)\b/gi,
  /\b(\d{4}\s*remaster|remastered\s*\d{4})\b/gi,
  /\[\s*cc\s*\]/gi,
  /\(\s*prod\.\s*[^)]+\)/gi,
  /\[\s*prod\.\s*[^\]]+\]/gi,
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
 * Clean a YouTube video title into an osu!-friendly search query.
 * @param {string} rawTitle - Raw title from YouTube
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
    .replace(/Music$/i, '')
    .replace(/Records$/i, '')
    .replace(/\s*ch\.\s*【.*?】/gi, '')
    .replace(/\s*【.*?】/g, '')
    .trim();

  let text = rawTitle;

  // Strip prefix tags
  text = text.replace(/^[【\[][^】\]]+[】\]]\s*/, '');

  // Strip noise patterns
  for (const pattern of NOISE_PATTERNS) {
    text = text.replace(pattern, '');
  }

  // Check if title had quotes e.g. "Sound Asleep" - Chikafuji Lisa
  let quotedTitle = null;
  const quoteMatch = text.match(/^["“](.+?)["”]\s*[-:—–]\s*(.+)$/);
  if (quoteMatch) {
    quotedTitle = {
      title: quoteMatch[1].trim(),
      artist: quoteMatch[2].trim(),
    };
  }

  text = text.replace(/["“”]/g, '').trim();

  let artist = '';
  let title = text;
  const queries = [];

  if (quotedTitle) {
    title = quotedTitle.title;
    artist = quotedTitle.artist;
    queries.push(`${artist} ${title}`);
    queries.push(`${title} ${artist}`);
    queries.push(title);
  } else {
    // Pattern A: "Title - Artist / Covered by CoverArtist" or "Title - Artist | Cover by CoverArtist"
    const coverMatch1 = text.match(/^(.+?)\s*-\s*(.+?)\s*[/|]\s*(?:covered by|cover by|cover)\s*(.+)$/i);
    // Pattern B: "Title by Artist | Covered by CoverArtist"
    const coverMatch2 = text.match(/^(.+?)\s+by\s+(.+?)\s*[/|]\s*(?:covered by|cover by|cover)\s*(.+)$/i);
    // Pattern C: "Artist - Title"
    const standardMatch = text.match(/^(.+?)\s*[-:—–]\s*(.+)$/);

    if (coverMatch1) {
      title = coverMatch1[1].trim();
      artist = coverMatch1[2].trim();
      queries.push(`${artist} ${title}`);
      queries.push(`${title} ${artist}`);
      queries.push(title);
    } else if (coverMatch2) {
      title = coverMatch2[1].trim();
      artist = coverMatch2[2].trim();
      queries.push(`${artist} ${title}`);
      queries.push(`${title} ${artist}`);
      queries.push(title);
    } else if (standardMatch) {
      artist = standardMatch[1].trim();
      title = standardMatch[2].trim();
      queries.push(`${artist} ${title}`);
      queries.push(`${title} ${artist}`);
      queries.push(title);
      if (cleanChannel && cleanChannel.toLowerCase() !== artist.toLowerCase()) {
        queries.push(`${cleanChannel} ${title}`);
      }
    } else {
      title = text.trim();
      if (cleanChannel) {
        artist = cleanChannel;
        queries.push(`${cleanChannel} ${title}`);
      }
      queries.push(title);
    }
  }

  // Remove featuring info for cleaner secondary queries
  const baseTitle = title.replace(/\s*\((?:feat\.|ft\.|featuring).*?\)/gi, '').trim();
  if (baseTitle !== title) {
    if (artist) queries.push(`${artist} ${baseTitle}`);
    queries.push(baseTitle);
  }

  // Check known iconic song artists
  const normTitle = (baseTitle || title).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const shortTitle = normTitle.replace(/\s+bury me$/, '').trim();
  
  if (KNOWN_SONG_ARTISTS[normTitle]) {
    queries.unshift(`${KNOWN_SONG_ARTISTS[normTitle]} ${baseTitle || title}`);
  } else if (KNOWN_SONG_ARTISTS[shortTitle]) {
    queries.unshift(`${KNOWN_SONG_ARTISTS[shortTitle]} ${baseTitle || title}`);
  }

  const uniqueQueries = Array.from(new Set(queries.filter(Boolean)));
  const cleanQuery = uniqueQueries[0] || (artist ? `${artist} - ${title}` : title);

  return {
    cleanQuery,
    artist: artist || cleanChannel,
    title: baseTitle || title,
    raw: rawTitle,
    fallbacks: uniqueQueries.slice(1),
    queries: uniqueQueries,
  };
}

export default cleanSongTitle;
