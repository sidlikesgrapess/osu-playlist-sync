process.env.OSU_CLIENT_ID='x'; process.env.OSU_CLIENT_SECRET='x';
const { cleanSongTitle, cleanPlaylistTitles } = await import('../../../src/lib/titleCleaner.js');
const { cleanSongTitle: oldClean } = await import('../../f46/titleCleaner.old.mjs');
const osu = await import('../../../src/lib/osu.js');
const set = (id, artist, title, extra={}) => ({ id, artist, artist_unicode: artist, title, title_unicode: title, tags:'', status:'ranked', favourite_count: 100, ...extra });
const log=[];
globalThis.fetch = async (url) => { const u=new URL(String(url)); if (u.pathname.endsWith('/oauth/token')) return Response.json({access_token:'t',expires_in:86400});
  const q=u.searchParams.get('q')||''; log.push(q);
  if (q.startsWith('artist=')) return Response.json({beatmapsets:[]});
  return Response.json({beatmapsets:[set(1,'Camellia','GHOST'), set(2,'Other','Ghost')]}); };
const pl=['Camellia - GHOST','Exit This Earth\'s Atomosphere [Camellia]'];
const chan='Anime Beats';
for (const [label, c] of [['NEW', cleanSongTitle(pl[0],chan,{source:'youtube',playlistTitles:cleanPlaylistTitles(pl)})],['OLD', oldClean(pl[0],chan,{source:'youtube'})]]) {
  log.length=0;
  const r = await osu.searchOsuBeatmaps(c.cleanQuery, { title:c.title, artist:c.artist, source:'youtube', artistFromTitle:c.artistFromTitle, altTitle:c.altTitle||'' });
  console.log(label, JSON.stringify({artist:c.artist, aft:c.artistFromTitle, rejection:r.rejection, top:r.beatmapsets?.[0]?.artist+' / '+r.beatmapsets?.[0]?.title, flag:r.beatmapsets?.[0]?.artistOverride||r.beatmapsets?.[0]?.titleOnly||false, calls:log}));
}
