import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Route handlers import through the `@/` alias (jsconfig.json). Map it to src/ for Node,
// the same way Next resolves it, so the real route files are what is tested.
const SRC = new URL('../src/', import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const target = ${JSON.stringify(SRC)} + specifier.slice(2);
    return next(target.endsWith('.js') ? target : target + '.js', context);
  }
  return next(specifier, context);
}`)}`);

const playlist = await import('../src/app/api/playlist/route.js');
const commits = await import('../src/app/api/github/commits/route.js');

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replace global fetch, recording every outbound request. */
function stubFetch(respond) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init);
  };
  return calls;
}

let ipSeq = 0;
/** A request from its own client address, so each test starts on a fresh budget. */
const clientFor = () => {
  ipSeq += 1;
  const ip = `203.0.113.${ipSeq}`;
  return (path) => new Request(`http://localhost${path}`, { headers: { 'x-forwarded-for': ip } });
};

test('/api/playlist: a disguised non provider link is a 400 with no outbound fetch', async () => {
  const calls = stubFetch(() => new Response('should not happen'));
  const req = clientFor();
  const res = await playlist.GET(req(`/api/playlist?url=${encodeURIComponent('https://example.com/?x=music.apple.com')}`));
  assert.equal(res.status, 400);
  assert.ok((await res.json()).error);
  assert.equal(calls.length, 0);

  const empty = await playlist.GET(req('/api/playlist'));
  assert.equal(empty.status, 400);
  const long = await playlist.GET(req(`/api/playlist?q=${'a'.repeat(501)}`));
  assert.equal(long.status, 400);
  assert.equal(calls.length, 0);
});

test('/api/playlist: 10 requests a minute, the 11th is a 429 with Retry-After, even for bad input', async () => {
  const calls = stubFetch(() => new Response('should not happen'));
  const req = clientFor();
  for (let i = 0; i < 10; i += 1) {
    const res = await playlist.GET(req('/api/playlist?url=https://example.com/'));
    assert.equal(res.status, 400, `request ${i + 1}`);
  }
  const over = await playlist.GET(req('/api/playlist?url=https://example.com/'));
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers.get('Retry-After')) >= 1);
  assert.equal(calls.length, 0);

  // another client is unaffected
  const other = await playlist.GET(clientFor()('/api/playlist?url=https://example.com/'));
  assert.equal(other.status, 400);
});

test('/api/playlist: an unreadable playlist is a 502 with extractionFailed, never demo songs', async () => {
  stubFetch((url) => (url.includes('youtubei')
    ? Response.json({ alerts: [{ alertRenderer: { type: 'ERROR' } }] })
    : new Response('<html>no data</html>', { status: 200 })));
  const res = await playlist.GET(clientFor()('/api/playlist?url=' + encodeURIComponent('https://www.youtube.com/playlist?list=PLdoesnotexist000')));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.extractionFailed, true);
  assert.ok(body.error);
  assert.equal(body.songs, undefined);
  assert.equal(body.isDemo, undefined);
});

test('/api/playlist: a success carries the songs and the window counts', async () => {
  const res = await playlist.GET(clientFor()('/api/playlist?q=' + encodeURIComponent('YOASOBI - Idol')));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.songs.length, 1);
  for (const key of ['playlistTitle', 'returnedCount', 'loadedCount', 'unavailableCount', 'truncated', 'playlistLength']) {
    assert.ok(key in body, key);
  }
  assert.equal(body.truncated, false);
});

const ghCommit = (sha, message) => ({
  sha,
  html_url: `https://github.com/x/y/commit/${sha}`,
  commit: { message, author: { date: '2026-09-24T00:00:00Z' } },
});

test('/api/github/commits: fetched through http.js with the server UA, cached at the CDN only on a good list', async () => {
  // A failing GitHub first: the fallback must not be held at the edge.
  const failing = stubFetch(() => new Response('rate limited', { status: 403 }));
  const req = clientFor();
  const down = await commits.GET(req('/api/github/commits'));
  assert.equal(down.status, 200);
  assert.deepEqual(await down.json(), { commits: [] });
  assert.equal(down.headers.get('Cache-Control'), null);
  assert.equal(failing.length, 1);
  assert.match(failing[0].init.headers['User-Agent'], /^osuSync\//);
  assert.equal(failing[0].init.cache, 'no-store');

  const calls = stubFetch(() => Response.json([ghCommit('abcdef1234', 'fix(ui): something\n\nbody')]));
  const ok = await commits.GET(req('/api/github/commits'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Cache-Control'), 's-maxage=120, stale-while-revalidate=300');
  assert.deepEqual((await ok.json()).commits[0], {
    sha: 'abcdef1', type: 'fix', text: 'something', date: '2026-09-24T00:00:00Z', url: 'https://github.com/x/y/commit/abcdef1234',
  });
  assert.equal(calls.length, 1);

  // inside the TTL the memory cache answers, still cacheable, with no second call
  const again = await commits.GET(req('/api/github/commits'));
  assert.equal(again.headers.get('Cache-Control'), 's-maxage=120, stale-while-revalidate=300');
  assert.equal(calls.length, 1);
});

test('/api/github/commits: 20 requests a minute, then a 429 with Retry-After and no Cache-Control', async () => {
  stubFetch(() => Response.json([]));
  const req = clientFor();
  for (let i = 0; i < 20; i += 1) {
    assert.equal((await commits.GET(req('/api/github/commits'))).status, 200, `request ${i + 1}`);
  }
  const over = await commits.GET(req('/api/github/commits'));
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers.get('Retry-After')) >= 1);
  assert.equal(over.headers.get('Cache-Control'), null);
});
