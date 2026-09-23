import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { extractMusicData, ExtractionError } from '../src/lib/extractors.js';
import { ValidationError } from '../src/lib/validate.js';
import { UA_PROFILES } from '../src/lib/http.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replace global fetch with a responder, recording every request made. */
function stubFetch(respond) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init);
  };
  return calls;
}

test('a URL-shaped input on no provider host is a 400 and fetches nothing', async () => {
  const calls = stubFetch(() => new Response('should not happen'));
  for (const input of ['https://example.com/?x=music.apple.com', 'http://music.apple.com/us/album/x/1', 'ftp://open.spotify.com/track/abc']) {
    await assert.rejects(extractMusicData(input), ValidationError, input);
  }
  assert.equal(calls.length, 0);
});

test('a lookalike host is plain text, never a link', async () => {
  const calls = stubFetch(() => new Response('should not happen'));
  const out = await extractMusicData('music.apple.com.evil.com/us/playlist/x');
  assert.equal(out.platform, 'query');
  assert.equal(out.songs.length, 1);
  assert.equal(calls.length, 0);
});

test('a provider URL is rebuilt from its id, never fetched as typed', async () => {
  const calls = stubFetch(() => new Response('<html></html>', { status: 200 }));
  await assert.rejects(
    extractMusicData('https://music.apple.com/us/album/idol/1688334284?i=1688334537&x=https://evil.example/'),
    ExtractionError,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://music.apple.com/us/album/idol/1688334284?i=1688334537');
  assert.equal(calls[0].init.headers['User-Agent'], UA_PROFILES.browserLike);
});

test('a single YouTube video goes to oEmbed by its video id, with the server UA', async () => {
  const calls = stubFetch(() => Response.json({ title: 'YOASOBI - Idol', author_name: 'Ayase / YOASOBI' }));
  const out = await extractMusicData('https://youtu.be/ZRtdQ81jPUQ?si=tracking');
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=ZRtdQ81jPUQ')}&format=json`,
  );
  assert.equal(calls[0].init.headers['User-Agent'], UA_PROFILES.server);
  assert.equal(out.isSingleTrack, true);
  assert.equal(out.songs[0].title, 'YOASOBI - Idol');
});

test('a YouTube link that names no video or playlist is a 400', async () => {
  const calls = stubFetch(() => new Response('should not happen'));
  await assert.rejects(extractMusicData('https://www.youtube.com/@somechannel'), ValidationError);
  assert.equal(calls.length, 0);
});

test('an upstream failure becomes an ExtractionError whose message carries no URL', async () => {
  stubFetch(() => new Response('nope', { status: 503 }));
  await assert.rejects(extractMusicData('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'), (err) => {
    assert.ok(err instanceof ExtractionError);
    assert.equal(err.status, 502);
    assert.doesNotMatch(err.message, /https?:|spotify\.com/);
    return true;
  });
});

test('an osu! profile link is refused here; it belongs to the player view', async () => {
  const calls = stubFetch(() => new Response('should not happen'));
  await assert.rejects(extractMusicData('https://osu.ppy.sh/users/2'), ValidationError);
  assert.equal(calls.length, 0);
});
