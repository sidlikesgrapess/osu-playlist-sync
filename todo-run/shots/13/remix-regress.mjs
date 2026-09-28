process.env.OSU_CLIENT_ID = 'x'; process.env.OSU_CLIENT_SECRET = 'x';
const NEW = await import('../../../src/lib/osu.js');
const NEWC = await import('../../../src/lib/titleCleaner.js');
const OLD = await import('./oldsrc/osu.js');
const OLDC = await import('./oldsrc/titleCleaner.js');
const set = (id, artist, title, fav) => ({ id, artist, artist_unicode: artist, title, title_unicode: title, tags: '', status: 'ranked', favourite_count: fav, beatmaps: [] });
const cases = [
  ['Shape of You - Stormzy Remix', 'Ed Sheeran', [set(1, 'Ed Sheeran', 'Shape of You', 5000), set(2, 'Ed Sheeran', 'Shape of You (Stormzy Remix)', 50)]],
  ['Night of Nights - Flowering nights remix', 'COOL&CREATE', [set(1, 'COOL&CREATE', 'Night of Nights', 5000), set(2, 'COOL&CREATE', 'Night of Nights (Flowering nights remix)', 50)]],
  ['Blinding Lights - Chromatics Remix', 'The Weeknd', [set(1, 'The Weeknd', 'Blinding Lights', 5000), set(2, 'The Weeknd', 'Blinding Lights (Chromatics Remix)', 50)]],
];
for (const [mod, C] of [['OLD', [OLD, OLDC]], ['NEW', [NEW, NEWC]]]) {
  const [osu, cl] = C;
  for (const [title, artist, sets] of cases) {
    const log = [];
    globalThis.fetch = async (url) => { const u = new URL(String(url)); if (u.pathname.endsWith('/oauth/token')) return Response.json({ access_token: 't', expires_in: 86400 }); const q = u.searchParams.get('q') || ''; log.push(q); return Response.json({ beatmapsets: q.startsWith('artist=') ? [] : sets }); };
    const c = cl.cleanSongTitle(title, artist, { source: 'spotify', providerArtist: artist });
    const r = await osu.searchOsuBeatmaps(c.cleanQuery, { title: c.title, altTitle: c.altTitle, artist: c.artist, queries: c.queries, status: 'any', strictness: 50, source: 'spotify' });
    console.log(mod, JSON.stringify(title), '-> top', r.beatmapsets[0]?.title, r.beatmapsets[0]?.matchScore?.toFixed?.(1), '| calls', log.length, JSON.stringify(log));
  }
}
