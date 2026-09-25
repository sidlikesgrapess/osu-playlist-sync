import { cleanSongTitle } from '../../../src/lib/titleCleaner.js';
const cases = [
 ['Re:Re:', '', {source:'apple', providerArtist:''}],
 ['ASIAN KUNG-FU GENERATION - Re:Re:', ''],
 ['Re:Re: - ASIAN KUNG-FU GENERATION', ''],
 ['Re:Re: / cover by X', ''],
 ['Alan Walker - Faded',''],['Artist: Title',''],['Artist | Title',''],['Artist • Title',''],['YOASOBI - Idol',''],
 ['Artist-Title',''],['Artist:Title',''],['Artist- Title',''],['Artist -Title',''],['Artist — Title',''],
 ['Re:Re:', '', {source:'query'}],['ASIAN KUNG-FU GENERATION - Re:Re:', '', {source:'query'}],
];
for (const [t,c,o] of cases) { const r = cleanSongTitle(t,c,o); console.log(JSON.stringify(t), '=>', JSON.stringify({title:r.extractedTitle??r.title, artist:r.extractedArtist??r.artist, aft:r.artistFromTitle, q:r.cleanQuery})); }
