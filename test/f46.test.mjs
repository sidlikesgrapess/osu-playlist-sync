// F-46: the title is parsed into a core plus tags, each tag is judged on evidence (never a
// word list), and two readings (H0 title, H1 altTitle) go to osu!, which arbitrates by score.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

const SRC = new URL('../src/', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const target = ${JSON.stringify(SRC)} + specifier.slice(2);
    return next(target.endsWith('.js') ? target : target + '.js', context);
  }
  if (specifier === 'next/server') return next('next/server.js', context);
  return next(specifier, context);
}`)}`);

process.env.OSU_CLIENT_ID = 'f46-stub';
process.env.OSU_CLIENT_SECRET = 'f46-stub';

const { cleanSongTitle, parseTitleTags, cleanPlaylistTitles } = await import('../src/lib/titleCleaner.js');
const osu = await import('../src/lib/osu.js');
const { buildSearchRequest } = await import('../src/lib/searchRequest.js');
const { makeSong } = await import('../src/lib/song.js');
const { extractMusicData } = await import('../src/lib/extractors.js');
const search = await import('../src/app/api/osu/search/route.js');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const spotify = (artist) => ({ source: 'spotify', providerArtist: artist });
const yt = { source: 'youtube' };

/** Stubs the osu! API: `answer(q)` gives the sets for a search; every query is logged. */
function stubOsu(answer) {
  const log = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith('/oauth/token')) return Response.json({ access_token: 'tok', expires_in: 86400 });
    const q = u.searchParams.get('q') || '';
    log.push(q);
    return Response.json({ beatmapsets: q.startsWith('artist=') ? [] : answer(q) || [] });
  };
  return log;
}

const set = (id, artist, title, extra = {}) => ({
  id, artist, artist_unicode: artist, title, title_unicode: title, tags: '', status: 'graveyard', favourite_count: 0, ...extra,
});

// ---- parser -------------------------------------------------------------------------------

test('the parser removes nothing: its parts join back into the input', () => {
  const titles = [
    '【Nightcore】 Faded (Lyrics) [1080p HD]',
    'ヨルシカ - 「ただ君に晴れ」 MV',
    'BTS (방탄소년단) \'Dynamite\' Official MV (Choreography Version)',
    'Mili - world.execute(me);',
    'Unclosed (bracket and [nested (deep)] tags',
    "Earth's Song I’m in 'quoted' “curly”",
    '',
  ];
  for (const t of titles) assert.equal(parseTitleTags(t).map((p) => p.raw).join(''), t, t);
});

test('the parser records each tag with its bracket type and content', () => {
  const parts = parseTitleTags('A [B] 「C」 (D [E])');
  const tags = parts.filter((p) => p.kind !== 'text');
  assert.deepEqual(tags.map((p) => [p.kind, p.open, p.content]), [
    ['bracket', '[', 'B'], ['quote', '「', 'C'], ['bracket', '(', 'D [E]'],
  ]);
  // an apostrophe inside a word opens no quote
  assert.equal(parseTitleTags("Earth's Song").length, 1);
});

// ---- evidence rules -------------------------------------------------------------------------

test('shape is certain noise: pp, accuracy, stars, mods, resolution, fps and a year', () => {
  assert.equal(cleanSongTitle('Camellia - GHOST [Insane] +HDHR 99.45% FC 727pp', 'osu! replays', yt).title, 'GHOST');
  for (const tag of ['[1080p]', '(60fps)', '(2019)', '[7.2*]']) {
    const r = cleanSongTitle(`Song Name ${tag}`, 'Some Artist', spotify('Some Artist'));
    assert.equal(r.title, 'Song Name', tag);
    assert.equal(r.altTitle, '', `${tag} is stripped from both readings`);
  }
});

test('a tag that echoes the channel or the artist is noise in both readings', () => {
  const r = cleanSongTitle('Song Name (Some Artist)', 'Some Artist', spotify('Some Artist'));
  assert.equal(r.title, 'Song Name');
  assert.equal(r.altTitle, '');
  // the same round tag with no echo is kept on a structured source
  assert.equal(cleanSongTitle('Song Name (Other Words)', 'Some Artist', spotify('Some Artist')).title, 'Song Name (Other Words)');
});

test('a tag that credits the channel by name and more is part of the title', () => {
  const r = cleanSongTitle('The White Stripes - Seven Nation Army (The Glitch Mob Remix)', 'The Glitch Mob', yt);
  assert.equal(r.title, 'Seven Nation Army (The Glitch Mob Remix)');
});

test('a tag on two or more tracks of the playlist is noise, as a Map or as the raw titles', () => {
  const titles = ['First (House Edit)', 'Second (House Edit)', 'Third'];
  const counts = cleanPlaylistTitles(titles);
  assert.equal(counts.get('house edit'), 2);
  for (const playlistTitles of [counts, titles]) {
    const r = cleanSongTitle('First (House Edit)', 'Some Artist', { ...spotify('Some Artist'), playlistTitles });
    assert.equal(r.title, 'First');
    assert.equal(r.altTitle, 'First (House Edit)');
  }
  // once is not a pattern
  assert.equal(cleanSongTitle('First (House Edit)', 'Some Artist', { ...spotify('Some Artist'), playlistTitles: ['First (House Edit)'] }).title, 'First (House Edit)');
});

test('bracket type: [] and 【】 lean noise, () is neutral', () => {
  const square = cleanSongTitle('Song Name [Other Words]', 'Some Artist', spotify('Some Artist'));
  assert.equal(square.title, 'Song Name');
  assert.equal(square.altTitle, 'Song Name [Other Words]');
  const lenticular = cleanSongTitle('Song Name 【Other Words】', 'Some Artist', spotify('Some Artist'));
  assert.equal(lenticular.title, 'Song Name');
  assert.equal(cleanSongTitle('Song Name (Other Words)', 'Some Artist', spotify('Some Artist')).altTitle, '');
});

test('position: a trailing tag leans noise, an interior one leans title', () => {
  const trailing = cleanSongTitle('Artist - Song Name (Other Words)', '', yt);
  assert.equal(trailing.title, 'Song Name');
  assert.equal(trailing.altTitle, 'Song Name (Other Words)');
  assert.equal(cleanSongTitle('Artist - Blue (Da Ba Dee) Remastered', '', yt).title, 'Blue (Da Ba Dee) Remastered');
  // a leading tag leans noise too, so it survives in altTitle for osu! to judge
  const leading = cleanSongTitle("(Don't Fear) The Reaper", '', yt);
  assert.equal(leading.title, 'The Reaper');
  assert.equal(leading.altTitle, "(Don't Fear) The Reaper");
});

test('a feat. credit leans noise, bracketed or not', () => {
  assert.equal(cleanSongTitle('Levitating (feat. DaBaby)', 'Dua Lipa', spotify('Dua Lipa')).title, 'Levitating');
  const r = cleanSongTitle('Martin Garrix - In The Name Of Love ft. Bebe Rexha (Official Video)', '', yt);
  assert.equal(r.title, 'In The Name Of Love');
  assert.equal(r.artist, 'Martin Garrix');
});

test('on a structured source a dash segment is a version tag kept only in altTitle', () => {
  const r = cleanSongTitle('Kaikai Kitan - TV Size', 'Eve', spotify('Eve'));
  assert.equal(r.title, 'Kaikai Kitan');
  assert.equal(r.altTitle, 'Kaikai Kitan - TV Size');
});

test('「」 is promoted: the quoted part is the title', () => {
  const r = cleanSongTitle('ヨルシカ - 「ただ君に晴れ」 MV', '', yt);
  assert.equal(r.title, 'ただ君に晴れ');
  assert.equal(r.artist, 'ヨルシカ');
  assert.equal(r.artistFromTitle, true);
});

test('a letter floor: a title of nothing but tags falls back to the tags', () => {
  assert.equal(cleanSongTitle('[Monstercat Release]', '', yt).title, 'Monstercat Release');
  assert.equal(cleanSongTitle('【MV】', '', yt).title, 'MV');
});

test('altTitle is set only when it differs from the title', () => {
  assert.equal(cleanSongTitle('Faded', 'Alan Walker', spotify('Alan Walker')).altTitle, '');
  assert.equal(cleanSongTitle('Alan Walker - Faded', '', yt).altTitle, '');
  assert.equal(cleanSongTitle('', '').altTitle, '');
  const r = cleanSongTitle('COOL&CREATE - Night of Nights (Flowering nights remix)', '', yt);
  assert.equal(r.title, 'Night of Nights');
  assert.equal(r.altTitle, 'Night of Nights (Flowering nights remix)');
  // H1 is never a query of its own in the cleaner: osu.js decides when to send it
  assert.ok(!r.queries.some((q) => q.includes('Flowering')));
});

test('no word list is left in the cleaner', () => {
  const code = readFileSync(new URL('../src/lib/titleCleaner.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  assert.doesNotMatch(code, /BRACKET_NOISE_TERMS|INLINE_NOISE_PATTERNS/);
  assert.doesNotMatch(code, /\b(?:lyrics?|remix|nightcore|cover(?:ed)?|audio|visualizer|official video|music video|sped up|slowed|reverb|karaoke|vietsub|romaji)\b/i);
});

// ---- the matcher arbitrates between the two readings ---------------------------------------

test('a candidate keeps the better of its H0 and H1 scores; a tie is H0', () => {
  const opts = { artistConfidence: 'high' };
  const remix = set(1, 'COOL&CREATE', 'Night of Nights (Flowering nights remix)');
  const h0Only = osu.scoreBeatmapMatch(remix, 'Night of Nights', 'COOL&CREATE', opts);
  const both = osu.scoreAgainstTitles(remix, 'Night of Nights', 'Night of Nights (Flowering nights remix)', 'COOL&CREATE', opts);
  assert.ok(both.score > h0Only, `${both.score} > ${h0Only}`);
  assert.equal(both.h0, h0Only);

  const plain = set(2, 'COOL&CREATE', 'Night of Nights');
  const tie = osu.scoreAgainstTitles(plain, 'Night of Nights', 'Night of Nights', 'COOL&CREATE', opts);
  assert.equal(tie.score, tie.h0);
  const noAlt = osu.scoreAgainstTitles(plain, 'Night of Nights', '', 'COOL&CREATE', opts);
  assert.equal(noAlt.score, osu.scoreBeatmapMatch(plain, 'Night of Nights', 'COOL&CREATE', opts));
});

test('the artist gate holds under either reading', () => {
  const other = set(3, 'Somebody Else', 'Night of Nights (Flowering nights remix)');
  const r = osu.scoreAgainstTitles(other, 'Night of Nights', 'Night of Nights (Flowering nights remix)', 'COOL&CREATE', { artistConfidence: 'high' });
  assert.equal(r.score, -Infinity);
});

test('an exact H0 leader jumps straight to the pending H1 query, then stops', async () => {
  const log = stubOsu(() => [set(10, 'COOL&CREATE', 'Night of Nights', { status: 'ranked' })]);
  const r = await osu.searchOsuBeatmaps('COOL&CREATE Night of Nights', {
    title: 'Night of Nights', altTitle: 'Night of Nights (Flowering nights remix)', artist: 'COOL&CREATE',
    queries: ['Night of Nights', 'Night of Nights COOL&CREATE'], status: 'any', strictness: 50, source: 'spotify',
  });
  assert.equal(r.beatmapsets[0].id, 10, 'with no fuller map the exact H0 map still wins');
  assert.deepEqual(log.filter((q) => !q.startsWith('artist=')), [
    'COOL&CREATE Night of Nights', 'COOL&CREATE Night of Nights (Flowering nights remix)',
  ]);
});

test('an exact H1 candidate already pooled ends the search with no H1 query', async () => {
  const plain = set(10, 'COOL&CREATE', 'Night of Nights', { status: 'ranked', favourite_count: 5000 });
  const remix = set(11, 'COOL&CREATE', 'Night of Nights (Flowering nights remix)');
  const log = stubOsu(() => [plain, remix]);
  const r = await osu.searchOsuBeatmaps('COOL&CREATE Night of Nights', {
    title: 'Night of Nights', altTitle: 'Night of Nights (Flowering nights remix)', artist: 'COOL&CREATE',
    queries: ['Night of Nights'], status: 'any', strictness: 50, source: 'spotify',
  });
  assert.equal(r.beatmapsets[0].id, 11);
  assert.equal(log.filter((q) => !q.startsWith('artist=')).length, 1);
});

test('with no exact H0 match the H1 query takes the last non-bare slot, within 4 calls', async () => {
  const opts = {
    title: 'Night of Nights', altTitle: 'Night of Nights (Flowering nights remix)', artist: 'COOL&CREATE',
    queries: Array.from({ length: 50 }, (_, i) => `fallback ${i}`), status: 'any', strictness: 50, source: 'spotify',
  };
  const empty = stubOsu(() => []);
  await osu.searchOsuBeatmaps('COOL&CREATE Night of Nights', opts);
  assert.deepEqual(empty.filter((q) => !q.startsWith('artist=')), [
    'COOL&CREATE Night of Nights', 'fallback 0', 'COOL&CREATE Night of Nights (Flowering nights remix)', 'Night of Nights',
  ]);

  const remix = set(11, 'COOL&CREATE', 'Night of Nights (Flowering nights remix)', { status: 'ranked' });
  stubOsu((q) => (q.includes('Flowering') ? [remix] : []));
  const r = await osu.searchOsuBeatmaps('COOL&CREATE Night of Nights', opts);
  assert.equal(r.beatmapsets[0].id, 11);
  assert.ok(r.beatmapsets[0].matchScore >= 150, 'scored as an exact match through H1');
});

test('with a slot to spare the H1 query is appended after the H0 variants', async () => {
  const log = stubOsu(() => []);
  await osu.searchOsuBeatmaps('A Song', {
    title: 'Song', altTitle: 'Song (Other Words)', artist: 'A', queries: [], status: 'any', strictness: 50, source: 'spotify',
  });
  assert.deepEqual(log.filter((q) => !q.startsWith('artist=')), ['A Song', 'Song', 'A Song (Other Words)']);
});

// ---- the fuller match wins (USER 2026-09-26) ------------------------------------------------

/** Runs one search over a fixed pool and returns the winning set's id. */
async function winner(pool, opts) {
  stubOsu(() => pool);
  const r = await osu.searchOsuBeatmaps(`${opts.artist} ${opts.title}`, {
    queries: [], status: 'any', strictness: 50, ...opts,
  });
  return r.beatmapsets[0]?.id;
}

const popular = { status: 'ranked', favourite_count: 20000, play_count: 5000000 };

/** A popular ranked plain map and a graveyard map carrying the fuller title. */
const fullerCase = (artist, plainTitle, fullTitle) => [
  set(1, artist, plainTitle, popular),
  set(2, artist, fullTitle),
];

// The three corpus uploads (todo-run/f46/corpus.json:47,48,52) and the Spotify remix.
for (const [raw, channel, source, plainTitle, fullTitle] of [
  ['COOL&CREATE - Night of Nights (Flowering nights remix)', 'COOL&CREATE', 'youtube', 'Night of Nights', 'Night of Nights (Flowering nights remix)'],
  ['Hanasaka Yui - Harumachi Clover (Swing Arrangement)', 'osu! music', 'youtube', 'Harumachi Clover', 'Harumachi Clover (Swing Arrangement)'],
  ['Disturbed - The Sound Of Silence (CYRIL Remix)', 'Disturbed', 'youtube', 'The Sound of Silence', 'The Sound Of Silence (CYRIL Remix)'],
  ['Shape of You - Stormzy Remix', 'Ed Sheeran', 'spotify', 'Shape of You', 'Shape of You (Stormzy Remix)'],
]) {
  test(`fuller wins: "${raw}" over a popular ranked "${plainTitle}"`, async () => {
    const cleaned = cleanSongTitle(raw, channel, source === 'spotify' ? spotify(channel) : yt);
    assert.equal(cleaned.title.toLowerCase(), plainTitle.toLowerCase(), 'H0 is the bare title');
    assert.ok(cleaned.altTitle, 'H1 keeps the tag');
    const artist = cleaned.artist;
    const id = await winner(fullerCase(artist, plainTitle, fullTitle), {
      title: cleaned.title, altTitle: cleaned.altTitle, artist, source, artistFromTitle: cleaned.artistFromTitle,
    });
    assert.equal(id, 2);
  });
}

test('a noise upload "Song (Official Video)" still matches the plain map "Song"', async () => {
  const cleaned = cleanSongTitle('Artist - Song (Official Video)', 'Artist', yt);
  assert.equal(cleaned.title, 'Song');
  const id = await winner([
    set(1, 'Artist', 'Song', { status: 'ranked' }),
    set(2, 'Artist', 'Song Something Else'),
  ], { title: cleaned.title, altTitle: cleaned.altTitle, artist: cleaned.artist, source: 'youtube' });
  assert.equal(id, 1);
});

test('the fuller margin never beats a better artist verdict, and the gate still refuses', () => {
  const alt = 'Night of Nights (Flowering nights remix)';
  const low = { artistConfidence: 'low' };
  const own = osu.scoreAgainstTitles(set(1, 'COOL&CREATE', 'Night of Nights', popular), 'Night of Nights', alt, 'COOL&CREATE', low);
  const other = osu.scoreAgainstTitles(set(3, 'Somebody Else', alt), 'Night of Nights', alt, 'COOL&CREATE', low);
  assert.ok(other.fuller, 'the other artist carries the fuller title');
  assert.ok(other.score < own.score, `${other.score} < ${own.score}`);
  const gated = osu.scoreAgainstTitles(set(3, 'Somebody Else', alt), 'Night of Nights', alt, 'COOL&CREATE', { artistConfidence: 'high' });
  assert.equal(gated.score, -Infinity);
  assert.equal(gated.fuller, false);
  assert.ok(osu.FULLER_MARGIN > 25 && osu.FULLER_MARGIN + 25 < 70, 'above ranked plus popularity, below one artist rung');
});

test('a trailing " ~ " is a tag: H0 is the core, H1 keeps it, and the full map wins', async () => {
  const a = cleanSongTitle('Artist - Song ~ Night Ver.', 'Ch', yt);
  assert.equal(a.title, 'Song');
  assert.equal(a.altTitle, 'Song ~ Night Ver.');
  const z = cleanSongTitle('ZUN - Lunatic Eyes ~ Invisible Full Moon', 'Touhou', yt);
  assert.equal(z.title, 'Lunatic Eyes');
  assert.equal(z.altTitle, 'Lunatic Eyes ~ Invisible Full Moon');
  const id = await winner(fullerCase('ZUN', 'Lunatic Eyes', 'Lunatic Eyes ~ Invisible Full Moon'),
    { title: z.title, altTitle: z.altTitle, artist: 'ZUN', source: 'spotify' });
  assert.equal(id, 2);
  // A leading "X ~ " that is the channel is still the uploader.
  assert.equal(cleanSongTitle('Nightcore ~ Hikaru Nara', 'Nightcore Anime', yt).title, 'Hikaru Nara');
});

test('a name credited as a tag on another playlist track still counts as the artist', () => {
  // A single bracketed credit elsewhere in the playlist says nothing about this upload.
  const playlist = ['Camellia - GHOST', "Exit This Earth's Atomosphere [Camellia]"];
  const r = cleanSongTitle(playlist[0], 'Chan', { ...yt, playlistTitles: playlist });
  assert.equal(r.artist, 'Camellia');
  assert.equal(r.title, 'GHOST');
  // A lone "Nightcore - X" keeps the credit osu! itself uses; the channel echo head still drops.
  assert.equal(cleanSongTitle('Nightcore - Monster (Lyrics)', 'Syrex', yt).artist, 'Nightcore');
  assert.equal(cleanSongTitle('Nightcore ~ Hikaru Nara', 'Nightcore Anime', yt).title, 'Hikaru Nara');
});

// ---- wiring --------------------------------------------------------------------------------

test('makeSong defaults altTitle to empty', () => {
  assert.equal(makeSong({ source: 'youtube' }).altTitle, '');
});

test('buildSearchRequest sends altTitle only when the song has one, never for a typed query', () => {
  const song = { title: 'x', extractedTitle: 'Song', altTitle: 'Song (Other Words)', extractedArtist: 'A', source: 'spotify' };
  assert.equal(buildSearchRequest(song).get('altTitle'), 'Song (Other Words)');
  assert.equal(buildSearchRequest({ ...song, altTitle: '' }).has('altTitle'), false);
  assert.equal(buildSearchRequest(song, { manualQuery: 'typed' }).has('altTitle'), false);
});

let ipSeq = 0;
const req = (path) => {
  ipSeq += 1;
  return new Request(`http://localhost${path}`, { headers: { 'x-forwarded-for': `203.0.113.${ipSeq}` } });
};

test('the search route forwards altTitle to the matcher', async () => {
  const log = stubOsu(() => []);
  const res = await search.GET(req(`/api/osu/search?q=${encodeURIComponent('A Song')}&title=Song&artist=A&source=spotify&status=any&altTitle=${encodeURIComponent('Song (Other Words)')}`));
  assert.equal(res.status, 200);
  assert.ok(log.includes('A Song (Other Words)'), log.join(' | '));
});

test('the search route derives altTitle from a typed query', async () => {
  const log = stubOsu(() => []);
  const res = await search.GET(req(`/api/osu/search?q=${encodeURIComponent('Artist - Song (Other Words)')}&source=query&status=any`));
  assert.equal(res.status, 200);
  assert.ok(log.includes('Artist Song (Other Words)'), log.join(' | '));
});

test('extractMusicData counts the playlist once and passes it to every track', async () => {
  const html = readFileSync(new URL('./fixtures/apple-playlist.html', import.meta.url), 'utf8')
    .replaceAll('stupid song', 'stupid song (Hits Radio)')
    .replaceAll('Man I Need', 'Man I Need (Hits Radio)');
  globalThis.fetch = async () => new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
  const out = await extractMusicData('https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb');
  const byTitle = Object.fromEntries(out.songs.map((s) => [s.title, s]));
  // "(Hits Radio)" is on two tracks, so it is the playlist's style: H0 drops it
  assert.equal(byTitle['stupid song (Hits Radio)'].extractedTitle, 'stupid song');
  assert.equal(byTitle['stupid song (Hits Radio)'].altTitle, 'stupid song (Hits Radio)');
  assert.equal(byTitle['Man I Need (Hits Radio)'].extractedTitle, 'Man I Need');
  assert.equal(byTitle['BbY WOW'].altTitle, '');
});
