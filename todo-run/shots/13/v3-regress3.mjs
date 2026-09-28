import { cleanSongTitle as oldClean } from '../../f46/titleCleaner.old.mjs';
for (const [t,c] of [['Camellia - GHOST','Chan'],['Eve - Kaikai Kitan','Chan'],['Hatsune Miku - Senbonzakura','Chan'],['Camellia - GHOST','Camellia Official']]) { const r=oldClean(t,c,{source:'youtube'}); console.log(JSON.stringify({t,title:r.title,artist:r.artist,aft:r.artistFromTitle})); }
