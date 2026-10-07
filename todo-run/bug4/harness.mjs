// Runs every link in cases.json through the real extractor (no osu! API), one at a time,
// paced, and prints what each row would look like: source, title, artist, query, cover host.
// Usage: node todo-run/bug4/harness.mjs [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { extractMusicData } from '../../src/lib/extractors.js';

const cases = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8'));
const PAUSE_MS = 1500;
const out = [];
for (const c of cases) {
  let row;
  try {
    const r = await extractMusicData(c.url);
    const s = r.songs;
    row = {
      label: c.label, url: c.url, ok: true,
      platform: r.platform, isSingleTrack: r.isSingleTrack, playlistTitle: r.playlistTitle,
      count: s.length,
      sample: s.slice(0, 3).map((x) => ({
        title: x.title, channel: x.channelTitle, artist: x.extractedArtist,
        artistFromTitle: x.artistFromTitle, query: x.cleanQuery,
        cover: x.thumbnail ? new URL(x.thumbnail).host : null,
      })),
      noArtist: s.filter((x) => !x.extractedArtist).length,
      noCover: s.filter((x) => !x.thumbnail).length,
      coverHosts: [...new Set(s.map((x) => x.thumbnail && new URL(x.thumbnail).host).filter(Boolean))],
    };
  } catch (e) {
    row = { label: c.label, url: c.url, ok: false, error: `${e.name}: ${e.message}`, cause: e.cause?.message };
  }
  out.push(row);
  console.log(JSON.stringify(row));
  await new Promise((r) => setTimeout(r, PAUSE_MS));
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
