import { cleanSongTitle, cleanPlaylistTitles } from '../../../src/lib/titleCleaner.js';
const show=(r)=>console.log(JSON.stringify({title:r.title,alt:r.altTitle,artist:r.artist,aft:r.artistFromTitle}));
const run=(pl,ch='Chan')=>{const p=cleanPlaylistTitles(pl); console.log('--'); for (const x of pl) show(cleanSongTitle(x,ch,{source:'youtube',playlistTitles:p}));};
run(['Alan Walker - Faded','Sing Me To Sleep (Alan Walker Remix)']);
run(['Marshmello - Alone','Bastille - Happier (feat. Marshmello)']);
run(['Camellia - GHOST','Exit This Earth\'s Atomosphere [Camellia]']);
run(['DECO*27 - Vampire','Hatsune Miku ~ Rolling Girl','Hatsune Miku - Senbonzakura']);
run(['Eve - Kaikai Kitan','Tokyo Ghetto 【Eve】']);
