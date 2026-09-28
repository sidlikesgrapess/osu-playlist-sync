// Two paced live searches through the dev server: corpus #14 and #15 as lone uploads
// (no playlist evidence, so the split artist stays "Nightcore").
import { cleanSongTitle } from '../../../src/lib/titleCleaner.js';
import { buildSearchRequest } from '../../../src/lib/searchRequest.js';
for (const [raw, channel] of [['Nightcore - Angel With A Shotgun', 'NightcoreReality'], ['Nightcore - Monster (Lyrics)', 'Syrex']]) {
  const c = cleanSongTitle(raw, channel, { source: 'youtube' });
  const song = { title: raw, channelTitle: channel, source: 'youtube', cleanQuery: c.cleanQuery, extractedTitle: c.title,
    extractedArtist: c.artist, altTitle: c.altTitle, artistFromTitle: c.artistFromTitle, fallbacks: c.fallbacks, queries: c.queries };
  const res = await fetch(`http://localhost:3000/api/osu/search?${buildSearchRequest(song, { status: 'any', strictness: 50 })}`);
  const body = await res.json();
  const top = (body.beatmapsets || []).slice(0, 3).map((s) => `${s.artist} - ${s.title} (#${s.id}, ${s.matchScore}${s.artistOverride ? ', artistOverride' : ''}${s.titleOnly ? ', titleOnly' : ''})`);
  console.log(JSON.stringify({ raw, artist: c.artist, h0: c.title, h1: c.altTitle, status: res.status, rejection: body.rejection || null, top }));
  await new Promise((r) => setTimeout(r, 2000));
}
