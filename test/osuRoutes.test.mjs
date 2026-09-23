import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Same `@/` mapping as routes.test.mjs, so the real route files are what is tested. The
// osu! routes also import `next/server`, which Next resolves itself; plain Node needs the
// file name spelled out (next has no `exports` map).
const SRC = new URL('../src/', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const target = ${JSON.stringify(SRC)} + specifier.slice(2);
    return next(target.endsWith('.js') ? target : target + '.js', context);
  }
  if (specifier === 'next/server') return next('next/server.js', context);
  return next(specifier, context);
}`)}`);

const player = await import('../src/app/api/osu/player/route.js');
const beatmaps = await import('../src/app/api/osu/player/beatmaps/route.js');
const search = await import('../src/app/api/osu/search/route.js');
const { toRouteError, demoResponse, RATE_LIMITED_MESSAGE } = await import('../src/lib/osuRoute.js');
const { ValidationError } = await import('../src/lib/validate.js');
const { UA_PROFILES } = await import('../src/lib/http.js');

const realFetch = globalThis.fetch;
const realEnv = { id: process.env.OSU_CLIENT_ID, secret: process.env.OSU_CLIENT_SECRET };
afterEach(() => {
  globalThis.fetch = realFetch;
  setCredentials(realEnv.id, realEnv.secret);
});

function setCredentials(id, secret) {
  if (id === undefined) delete process.env.OSU_CLIENT_ID; else process.env.OSU_CLIENT_ID = id;
  if (secret === undefined) delete process.env.OSU_CLIENT_SECRET; else process.env.OSU_CLIENT_SECRET = secret;
}

function stubFetch(respond) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init);
  };
  return calls;
}

/** Credentials set and the token endpoint stubbed; `api` answers every osu! API call. */
function withOsu(api) {
  setCredentials('test-client', 'test-secret');
  return stubFetch((url, init) => {
    if (url.endsWith('/oauth/token')) return Response.json({ access_token: 'tok', expires_in: 86400 });
    return api(url, init);
  });
}

let ipSeq = 0;
const clientFor = () => {
  ipSeq += 1;
  const ip = `198.51.100.${ipSeq}`;
  return (path) => new Request(`http://localhost${path}`, { headers: { 'x-forwarded-for': ip } });
};

test('demo mode: with no credentials all three osu! routes answer isDemo, with no outbound call', async () => {
  setCredentials('', '');
  const calls = stubFetch(() => new Response('should not happen'));
  const req = clientFor();

  const p = await player.GET(req('/api/osu/player?q=cookiezi'));
  assert.equal(p.status, 200);
  assert.deepEqual(await p.json(), { isDemo: true, type: 'demo' });

  const b = await beatmaps.GET(req('/api/osu/player/beatmaps?userId=124493&type=best'));
  assert.equal(b.status, 200);
  assert.deepEqual(await b.json(), { isDemo: true, items: [] });

  const s = await search.GET(req('/api/osu/search?q=freedom+dive'));
  assert.equal(s.status, 200);
  assert.deepEqual(await s.json(), { isDemo: true, beatmapsets: [] });

  assert.equal(calls.length, 0);
});

test('a malformed userId is a 400 before any upstream call (F-22)', async () => {
  const calls = withOsu(() => Response.json([]));
  const req = clientFor();
  for (const bad of ['1%2F..%2Fx', 'abc', '-5', '0', '999999999999']) {
    const res = await beatmaps.GET(req(`/api/osu/player/beatmaps?userId=${bad}&type=best`));
    assert.equal(res.status, 400, bad);
    const p = await player.GET(req(`/api/osu/player?userId=${bad}`));
    assert.equal(p.status, 400, bad);
  }
  const noType = await beatmaps.GET(req('/api/osu/player/beatmaps?userId=5&type=../x'));
  assert.equal(noType.status, 400);
  assert.equal(calls.length, 0);
});

test('an unknown player is a 404 with a plain message that never names the upstream path (F-31)', async () => {
  const calls = withOsu(() => new Response('{"error":null}', { status: 404 }));
  const res = await player.GET(clientFor()('/api/osu/player?userId=999999999'));
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, 'No osu! player found for that name or link.');
  assert.doesNotMatch(JSON.stringify(body), /users|api\/v2/);
  assert.ok(calls.some(c => c.url.includes('/users/999999999')));
});

test('an upstream 429 is a 429 with a plain message; any other failure is a 502 that hides the path', async () => {
  withOsu(() => new Response('slow down', { status: 429, headers: { 'retry-after': '17' } }));
  const limited = await beatmaps.GET(clientFor()('/api/osu/player/beatmaps?userId=5&type=favourite'));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '17');
  assert.equal((await limited.json()).error, RATE_LIMITED_MESSAGE);

  withOsu(() => new Response('boom', { status: 500 }));
  const failed = await beatmaps.GET(clientFor()('/api/osu/player/beatmaps?userId=5&type=favourite'));
  assert.equal(failed.status, 502);
  assert.doesNotMatch(JSON.stringify(await failed.json()), /users|favourite|500/);
});

test('every osu! call, the token request included, sends the server User-Agent', async () => {
  const calls = withOsu(() => Response.json([]));
  const res = await beatmaps.GET(clientFor()('/api/osu/player/beatmaps?userId=5&type=most_played'));
  assert.equal(res.status, 200);
  assert.ok(calls.length >= 1);
  for (const call of calls) {
    assert.equal(call.init.headers['User-Agent'], UA_PROFILES.server, call.url);
  }
});

test('player routes allow 20 a minute and the search route 60; the next is a 429 with Retry-After', async () => {
  const calls = stubFetch(() => new Response('should not happen'));
  for (const [route, path, budget] of [
    [player, '/api/osu/player?userId=abc', 20],
    [beatmaps, '/api/osu/player/beatmaps?userId=abc&type=best', 20],
    [search, '/api/osu/search', 60],
  ]) {
    const req = clientFor();
    for (let i = 0; i < budget; i += 1) {
      assert.equal((await route.GET(req(path))).status, 400, `${path} #${i + 1}`);
    }
    const over = await route.GET(req(path));
    assert.equal(over.status, 429, path);
    assert.ok(Number(over.headers.get('Retry-After')) >= 1);
  }
  assert.equal(calls.length, 0);
});

test('toRouteError maps by status alone and demoResponse spreads its extra fields', async () => {
  const bad = toRouteError(new ValidationError('q is required'));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, 'q is required');

  const plain = toRouteError(new Error('osu! API responded 503 for /users/1/scores/best'));
  assert.equal(plain.status, 502);
  assert.doesNotMatch((await plain.json()).error, /users/);

  const noHeader = toRouteError(Object.assign(new Error('x'), { status: 429 }));
  assert.equal(noHeader.status, 429);
  assert.equal(noHeader.headers.get('Retry-After'), null);

  const demo = demoResponse({ items: [] });
  assert.deepEqual(await demo.json(), { isDemo: true, items: [] });
});

test('the search route bounds fallbacks, so 50 of them still cost at most 4 search calls (F-14)', async () => {
  const calls = withOsu(() => Response.json({ beatmapsets: [] }));
  const fallbacks = JSON.stringify(Array.from({ length: 50 }, (_, i) => `variant ${i} ${'x'.repeat(300)}`));
  const res = await search.GET(clientFor()(
    `/api/osu/search?q=a+b&title=b&artist=a&source=spotify&status=any&fallbacks=${encodeURIComponent(fallbacks)}`,
  ));
  assert.equal(res.status, 200);
  const searches = calls.filter(c => c.url.includes('/beatmapsets/search') && !c.url.includes('artist%3D'));
  assert.ok(searches.length <= 4, String(searches.length));
  for (const c of searches) assert.ok(decodeURIComponent(new URL(c.url).searchParams.get('q')).length <= 200);
});

test('an upstream 429 mid-search is a 429 from the search route, never an empty success (F-09)', async () => {
  withOsu(() => new Response('slow down', { status: 429, headers: { 'retry-after': '12' } }));
  const res = await search.GET(clientFor()('/api/osu/search?q=a+b&title=b&artist=a&source=spotify&status=any'));
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('Retry-After'), '12');
  const body = await res.json();
  assert.equal(body.success, undefined);
  assert.equal(body.error, RATE_LIMITED_MESSAGE);
});

test('a typed query is cleaned on the server, so its artist reaches the gate (F-05)', async () => {
  const calls = withOsu(() => Response.json({ beatmapsets: [] }));
  const res = await search.GET(clientFor()('/api/osu/search?q=Camellia+-+Ghost&source=query&status=any'));
  assert.equal(res.status, 200);
  const qs = calls
    .filter(c => c.url.includes('/beatmapsets/search'))
    .map(c => new URL(c.url).searchParams.get('q'));
  assert.equal(qs[0], 'Camellia Ghost', 'the derived artist and title lead');
  assert.ok(qs.includes('Camellia - Ghost'), 'the typed query itself still runs');
  assert.ok(qs.includes('Ghost'), 'and so does the bare title');
  assert.ok(qs.includes('artist=Camellia'), 'the derived artist is settled by resolveArtistTrust');
});
