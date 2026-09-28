// One live search: is any map titled exactly "Harumachi Clover (Swing Arrangement)"?
import { getOsuAccessToken } from '../../../src/lib/osu.js';
import { UA_PROFILES } from '../../../src/lib/http.js';
import { normalizeForComparison as n } from '../../../src/lib/text.js';
const q = 'Hanasaka Yui Harumachi Clover (Swing Arrangement)';
const token = await getOsuAccessToken();
const res = await fetch(`https://osu.ppy.sh/api/v2/beatmapsets/search?q=${encodeURIComponent(q)}&sort=relevance_desc&s=any`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA_PROFILES.server } });
const sets = (await res.json()).beatmapsets || [];
console.log(res.status, sets.length, 'exact:', sets.filter((s) => n(s.title) === n('Harumachi Clover (Swing Arrangement)')).map((s) => `${s.id} ${s.artist} - ${s.title}`));
console.log(sets.filter((s) => /swing/i.test(s.title)).map((s) => `${s.id} ${s.artist} - ${s.title}`));
