import { readFileSync } from 'node:fs';
import { cleanSongTitle } from '../../../src/lib/titleCleaner.js';
const c = JSON.parse(readFileSync(new URL('../../f46/corpus.json', import.meta.url)));
const list = Array.isArray(c) ? c : c.entries;
list.forEach((e, i) => {
  const n = i + 1;
  if (![14,15,16,29,40,41,45,104,109].includes(n)) return;
  const r = cleanSongTitle(e.raw, e.channel || '', { source: e.source || 'youtube', ...(e.artist ? { providerArtist: e.artist } : {}) });
  console.log(n, e.raw, '=>', JSON.stringify({ t: r.title, alt: r.altTitle, a: r.artist, aft: r.artistFromTitle }));
});
