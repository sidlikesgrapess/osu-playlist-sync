// The continuation walk behind the 500 song playlist cap (todo item 08, REBUILD_PLAN.md F-18).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { parsePlaylistData, fetchPlaylistItems, PLAYLIST_LOAD_CAP } from '../src/lib/youtube.js';
import { extractMusicData } from '../src/lib/extractors.js';
import { UA_PROFILES } from '../src/lib/http.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const lockup = (id, title) => ({
  lockupViewModel: {
    contentId: id,
    metadata: { lockupMetadataViewModel: {
      title: { content: title },
      metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: 'Some Channel' } }] }] } },
    } },
  },
});

function browse(items, { header } = {}) {
  return {
    header,
    metadata: { playlistMetadataRenderer: { title: 'Mix' } },
    contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: {
      contents: [{ itemSectionRenderer: { contents: items } }],
    } } } }] } },
  };
}

const pageHeader = (rows) => ({
  pageHeaderRenderer: { pageTitle: 'Mix', content: { pageHeaderViewModel: { metadata: { contentMetadataViewModel: {
    metadataRows: rows.map((parts) => ({ metadataParts: parts.map((t) => ({ text: { content: t } })) })),
  } } } } },
});

const counts = (out) => [out.returnedCount, out.loadedCount, out.unavailableCount, out.truncated, out.playlistLength];
const vid = (i) => `v${String(i).padStart(10, '0')}`;
const tokenItem = (token) => ({ continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } } });
const modernTokenItem = (token) => ({ continuationItemViewModel: { continuationCommand: { innertubeCommand: { continuationCommand: { token } } } } });
const contPage = (items) => ({ onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: items } }] });

function stubFetch(respond) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init);
  };
  return calls;
}

/**
 * A playlist of `total` videos served 100 at a time: the first browse response, then one
 * continuation page per token. `pages` overrides the page sizes (for the hidden rule), and
 * `fail(k)` makes continuation page k answer an error.
 */
function fakePlaylist(total, { pages, header, fail } = {}) {
  const sizes = pages || Array.from({ length: Math.ceil(total / 100) }, (_, k) => Math.min(100, total - k * 100));
  let start = 0;
  const built = sizes.map((size, k) => {
    const items = Array.from({ length: size }, (_, i) => lockup(vid(start + i), `Song ${start + i}`));
    start += size;
    if (k < sizes.length - 1) items.push(tokenItem(`T${k + 1}`));
    return items;
  });
  return stubFetch((url, init) => {
    if (!url.includes('youtubei')) return new Response('<html></html>', { status: 200 });
    const body = JSON.parse(init.body);
    if (body.browseId) return Response.json(browse(built[0], { header: header ?? pageHeader([[`${total} videos`]]) }));
    const k = Number(body.continuation.slice(1));
    if (fail?.(k)) return new Response('busy', { status: 503 });
    return Response.json(contPage(built[k]));
  });
}

function fakeClock() {
  let t = 0;
  const sleeps = [];
  return { sleeps, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } };
}

test('the legacy whole playlist helper still caps a single walk at 500', async () => {
  assert.equal(PLAYLIST_LOAD_CAP, 500);
  fakePlaylist(700);
  const yt = await fetchPlaylistItems('PLsomething00', undefined, fakeClock());
  assert.equal(yt.loadedCount, 500);
  assert.equal(yt.loadCap, 500);
  assert.equal(yt.truncated, true);
});

test('the existing whole playlist helper can walk past 500 with a larger limit', async () => {
  const calls = fakePlaylist(700);
  const out = await fetchPlaylistItems('PLsomething00', 700, fakeClock());
  assert.equal(out.loadedCount, 700);
  assert.equal(out.truncated, false);
  assert.equal(calls.length, 7);
});

test('extractMusicData fetches one window per request and continues beyond 500', async () => {
  const calls = fakePlaylist(700);
  const url = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj';
  let continuation = null;
  for (let page = 0; page < 7; page += 1) {
    const yt = await extractMusicData(url, { youtubeContinuation: continuation });
    assert.equal(calls.length, page + 1);
    assert.equal(yt.songs.length, 100);
    assert.equal(yt.songs[0].id, vid(page * 100));
    assert.equal(yt.truncated, page < 6);
    continuation = yt.nextContinuation;
  }
  assert.equal(continuation, null);
  assert.deepEqual(calls.map(({ init }) => JSON.parse(init.body).continuation || null),
    [null, 'T1', 'T2', 'T3', 'T4', 'T5', 'T6']);
});

test('the next window accepts endpoint and legacy continuation response shapes', async () => {
  for (const shape of ['onResponseReceivedEndpoints', 'continuationContents']) {
    const first = browse([lockup(vid(0), 'A'), tokenItem('T1')]);
    const second = shape === 'continuationContents'
      ? { continuationContents: { playlistVideoListContinuation: { contents: [lockup(vid(1), 'B')] } } }
      : { onResponseReceivedEndpoints: [{ appendContinuationItemsAction: { continuationItems: [lockup(vid(1), 'B')] } }] };
    const calls = stubFetch((_url, init) => Response.json(JSON.parse(init.body).browseId ? first : second));
    const url = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj';
    const initial = await extractMusicData(url);
    const next = await extractMusicData(url, { youtubeContinuation: initial.nextContinuation });
    assert.equal(next.songs[0].id, vid(1));
    assert.equal(calls.length, 2);
  }
});

test('modern continuationItemViewModel exposes the next page', async () => {
  const first = browse([lockup(vid(0), 'A'), modernTokenItem('T1')]);
  const second = contPage([lockup(vid(1), 'B')]);
  const calls = stubFetch((_url, init) => Response.json(JSON.parse(init.body).browseId ? first : second));
  const url = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj';
  const initial = await extractMusicData(url);
  assert.equal(initial.nextContinuation, 'T1');
  const next = await extractMusicData(url, { youtubeContinuation: initial.nextContinuation });
  assert.equal(next.songs[0].id, vid(1));
  assert.equal(calls.length, 2);
});

test('an oversized window stops at 100 without exposing a cursor that skips songs', async () => {
  const first = browse([
    ...Array.from({ length: 120 }, (_, i) => lockup(vid(i), `Song ${i}`)),
    tokenItem('after-120'),
  ]);
  stubFetch(() => Response.json(first));
  const out = await extractMusicData('https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj');
  assert.equal(out.songs.length, 100);
  assert.equal(out.truncated, true);
  assert.equal(out.nextContinuation, null);
});

test('a failed next window can be retried with the same cursor', async () => {
  let attempts = 0;
  const calls = fakePlaylist(200, { fail: (page) => page === 1 && attempts++ === 0 });
  const url = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj';
  const first = await extractMusicData(url);
  await assert.rejects(extractMusicData(url, { youtubeContinuation: first.nextContinuation }));
  const second = await extractMusicData(url, { youtubeContinuation: first.nextContinuation });
  assert.equal(second.songs[0].id, vid(100));
  assert.equal(second.nextContinuation, null);
  assert.equal(calls.length, 3);
});

test('a continuation that repeats its own cursor is refused', async () => {
  const first = browse([lockup(vid(0), 'A'), tokenItem('T1')]);
  const repeated = contPage([lockup(vid(0), 'A'), tokenItem('T1')]);
  const calls = stubFetch((_url, init) => Response.json(JSON.parse(init.body).browseId ? first : repeated));
  const url = 'https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj';
  const initial = await extractMusicData(url);
  await assert.rejects(extractMusicData(url, { youtubeContinuation: initial.nextContinuation }));
  assert.equal(calls.length, 2);
});

test('a 250 item playlist is walked in full over 3 requests, positions contiguous, not truncated', async () => {
  const calls = fakePlaylist(250);
  const out = await fetchPlaylistItems('PLsomething00', undefined, fakeClock());
  assert.equal(calls.length, 3);
  assert.deepEqual(counts(out), [250, 250, 0, false, 250]);
  assert.equal(out.loadCap, 500);
  assert.deepEqual(out.songs.map((s) => s.position), Array.from({ length: 250 }, (_, i) => i));
  assert.deepEqual(out.songs.map((s) => s.id), Array.from({ length: 250 }, (_, i) => vid(i)));
});

test('request count is ceil(min(N, 500) / 100)', async () => {
  for (const n of [1, 100, 101, 250, 500, 501, 700, 1200]) {
    const calls = fakePlaylist(n);
    const out = await fetchPlaylistItems('PLsomething00', undefined, fakeClock());
    assert.equal(calls.length, Math.ceil(Math.min(n, 500) / 100), `N=${n}`);
    assert.equal(out.loadedCount, Math.min(n, 500), `N=${n}`);
    assert.equal(out.truncated, n > 500, `N=${n}`);
  }
});

test('a 700 item playlist loads 500 and is truncated', async () => {
  const calls = fakePlaylist(700);
  const out = await fetchPlaylistItems('PLsomething00', undefined, fakeClock());
  assert.equal(calls.length, 5);
  assert.deepEqual(counts(out), [500, 500, 0, true, 700]);
  assert.equal(out.songs.at(-1).position, 499);
});

test('continuations are one paced POST carrying the token, with the browser profile', async () => {
  const clock = fakeClock();
  const calls = fakePlaylist(300);
  await fetchPlaylistItems('PLsomething00', undefined, clock);
  const posts = calls.slice(1);
  assert.equal(posts.length, 2);
  for (const [i, call] of posts.entries()) {
    assert.equal(call.init.method, 'POST');
    const body = JSON.parse(call.init.body);
    assert.equal(body.continuation, `T${i + 1}`);
    assert.equal(body.context.client.clientName, 'WEB');
    assert.equal(body.browseId, undefined);
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get('user-agent'), UA_PROFILES.browserLike);
    assert.equal(headers.get('content-type'), 'application/json');
  }
  assert.deepEqual(clock.sleeps, [750, 750]);
});

test('hidden unavailable videos are inferred across pages: 100, 100, 46 against 250', async () => {
  fakePlaylist(250, { pages: [100, 100, 46] });
  const out = await fetchPlaylistItems('PLsomething00', undefined, fakeClock());
  assert.deepEqual(counts(out), [246, 250, 4, false, 250]);
});

test('a truncated walk infers nothing from the header length', async () => {
  fakePlaylist(900, { pages: [100, 100, 100, 100, 100, 100], header: pageHeader([['950 videos']]) });
  const out = await fetchPlaylistItems('PLsomething00', undefined, fakeClock());
  assert.deepEqual(counts(out), [500, 500, 0, true, 950]);
});

test('a failed continuation keeps the songs already loaded, is truncated, and does not throw', async () => {
  const calls = fakePlaylist(300, { fail: (k) => k === 1 });
  const out = await fetchPlaylistItems('PLsomething00', undefined, fakeClock());
  assert.equal(calls.length, 2);
  assert.deepEqual(counts(out), [100, 100, 0, true, 300]);
});

test('an unreadable continuation shape stops the walk as truncated', async () => {
  const calls = stubFetch((url, init) => {
    const body = JSON.parse(init.body);
    return body.browseId
      ? Response.json(browse([lockup(vid(0), 'A'), tokenItem('T1')], { header: pageHeader([['2 videos']]) }))
      : Response.json({ somethingElse: true });
  });
  const out = await fetchPlaylistItems('PLsomething00', undefined, fakeClock());
  assert.equal(calls.length, 2);
  assert.deepEqual(counts(out), [1, 1, 0, true, 2]);
});

test('the walk stops at its deadline and reports truncated', async () => {
  let t = 0;
  // every gap costs 8 s of fake time, so the 20 s deadline allows two continuation pages
  const clock = { now: () => t, sleep: async () => { t += 8000; } };
  const calls = fakePlaylist(500);
  const out = await fetchPlaylistItems('PLsomething00', undefined, clock);
  assert.equal(calls.length, 3);
  assert.equal(out.loadedCount, 300);
  assert.equal(out.truncated, true);
});

test('the page scrape fallback follows the same continuation token', async () => {
  const first = browse([...Array.from({ length: 100 }, (_, i) => lockup(vid(i), `S${i}`)), tokenItem('T1')], {
    header: pageHeader([['150 videos']]),
  });
  const second = contPage(Array.from({ length: 50 }, (_, i) => lockup(vid(100 + i), `S${100 + i}`)));
  const seen = [];
  const calls = stubFetch((url, init) => {
    if (!url.includes('youtubei')) return new Response(`<script>var ytInitialData = ${JSON.stringify(first)};</script>`, { status: 200 });
    const body = JSON.parse(init.body);
    if (body.browseId) return Response.json(browse([]));
    seen.push(body.continuation);
    return Response.json(second);
  });
  const out = await fetchPlaylistItems('PLsomething00', undefined, fakeClock());
  assert.equal(calls.length, 3);
  assert.deepEqual(seen, ['T1']);
  assert.deepEqual(counts(out), [150, 150, 0, false, 150]);
});

test('parsePlaylistData walks continuation pages the same way, network free', () => {
  const first = browse([lockup(vid(0), 'A'), lockup(vid(1), 'B'), tokenItem('T1')], { header: pageHeader([['4 videos']]) });
  const out = parsePlaylistData(first, 500, [contPage([lockup(vid(2), 'C')])]);
  assert.deepEqual(counts(out), [3, 4, 1, false, 4]);
  assert.deepEqual(out.songs.map((s) => s.position), [0, 1, 2]);
  // the cap cuts a page short: truncated, nothing inferred
  const cut = parsePlaylistData(first, 2, [contPage([lockup(vid(2), 'C')])]);
  assert.deepEqual(counts(cut), [2, 2, 0, true, 4]);
});
