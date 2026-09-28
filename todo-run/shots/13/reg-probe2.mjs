import { cleanSongTitle, cleanPlaylistTitles } from '../../../src/lib/titleCleaner.js';
import { cleanSongTitle as oldClean } from './old/titleCleaner.mjs';
const titles = ['Alpha (Official Video)', 'Beta (Official Video)', 'Gamma (Official Video)', 'Delta [MV]'];
const pl = cleanPlaylistTitles(titles);
console.log(JSON.stringify(pl));
for (const t of titles) console.log(t, '| pl:', JSON.stringify(cleanSongTitle(t, 'Chan', { playlistTitles: pl })), '| nopl:', JSON.stringify(cleanSongTitle(t, 'Chan')));
console.log('old keys', Object.keys(oldClean('A - B (feat. C) [MV]', 'x')));
