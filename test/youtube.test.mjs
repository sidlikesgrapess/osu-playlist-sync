import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { parsePlaylistData, readPlaylistLength, fetchPlaylistItems, ExtractionError } from '../src/lib/youtube.js';
import { extractMusicData } from '../src/lib/extractors.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Synthetic browse responses in the shapes the extractor reads.
const lockup = (id, title, extra = {}) => ({
  lockupViewModel: {
    contentId: id,
    metadata: { lockupMetadataViewModel: {
      title: { content: title },
      metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: 'Some Channel' } }] }] } },
    } },
    ...extra,
  },
});
const pvr = (id, title, extra = {}) => ({
  playlistVideoRenderer: {
    videoId: id,
    title: { runs: [{ text: title }] },
    shortBylineText: { runs: [{ text: 'Uploader' }] },
    lengthSeconds: '215',
    ...extra,
  },
});
const continuation = { continuationItemRenderer: { continuationEndpoint: {} } };

function browse(items, { header, nested = false } = {}) {
  const contents = nested ? [{ playlistVideoListRenderer: { contents: items } }] : items;
  return {
    header,
    metadata: { playlistMetadataRenderer: { title: 'Mix' } },
    contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: {
      contents: [{ itemSectionRenderer: { contents } }],
    } } } }] } },
  };
}

const pageHeader = (rows) => ({
  pageHeaderRenderer: { pageTitle: 'Mix', content: { pageHeaderViewModel: { metadata: { contentMetadataViewModel: {
    metadataRows: rows.map((parts) => ({ metadataParts: parts.map((t) => ({ text: { content: t } })) })),
  } } } } },
});

test('unavailable items are read from renderer fields, never from the title', () => {
  const out = parsePlaylistData(browse([
    lockup('aaaaaaaaaaa', 'Song One'),
    lockup('bbbbbbbbbbb', 'Song Two', { isPlayable: false }),
    // a real song may be titled anything; the text is not a signal
    lockup('ccccccccccc', 'Deleted video'),
    lockup('ddddddddddd', 'Private video'),
  ]));
  assert.deepEqual(out.songs.map((s) => s.title), ['Song One', 'Deleted video', 'Private video']);
  assert.equal(out.loadedCount, 4);
  assert.equal(out.returnedCount, 3);
  assert.equal(out.unavailableCount, 1);
  assert.equal(out.truncated, false);
  assert.equal(out.playlistLength, null);
});

test('a playlistVideoRenderer with no lengthSeconds, or isPlayable false, is unavailable', () => {
  const out = parsePlaylistData(browse([
    pvr('aaaaaaaaaaa', 'Kept'),
    pvr('bbbbbbbbbbb', 'No length', { lengthSeconds: undefined }),
    pvr('ccccccccccc', 'Blocked', { isPlayable: false }),
  ], { nested: true }));
  assert.deepEqual(out.songs.map((s) => s.title), ['Kept']);
  assert.equal(out.loadedCount, 3);
  assert.equal(out.unavailableCount, 2);
});

test('every lockup gets a thumbnail built from its id', () => {
  const out = parsePlaylistData(browse([lockup('aaaaaaaaaaa', 'Song One')]));
  assert.equal(out.songs[0].thumbnail, 'https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg');
  assert.equal(out.songs[0].id, 'aaaaaaaaaaa');
  assert.equal(out.songs[0].channelTitle, 'Some Channel');
});

test('truncated is structural: a continuation in the window, or the maxVideos cap cutting it short', () => {
  const items = [lockup('aaaaaaaaaaa', 'A'), lockup('bbbbbbbbbbb', 'B'), lockup('ccccccccccc', 'C')];
  assert.equal(parsePlaylistData(browse([...items, continuation])).truncated, true);
  assert.equal(parsePlaylistData(browse(items)).truncated, false);
  const capped = parsePlaylistData(browse(items), 2);
  assert.equal(capped.truncated, true);
  assert.equal(capped.returnedCount, 2);
  assert.equal(capped.loadedCount, 2);
  assert.equal(parsePlaylistData(browse(items), 3).truncated, false);
  // the length text alone never sets it
  assert.equal(parsePlaylistData(browse(items, { header: pageHeader([['Owner'], ['500 videos']]) })).truncated, false);
});

test('playlistLength is read from any header metadataParts entry, and is null otherwise', () => {
  assert.equal(readPlaylistLength(pageHeader([['Owner', '12 views'], ['Playlist', '200 videos', 'Updated today']])), 200);
  assert.equal(readPlaylistLength(pageHeader([['1,204 videos']])), 1204);
  assert.equal(readPlaylistLength(pageHeader([['1 video']])), 1);
  assert.equal(readPlaylistLength(pageHeader([['Owner'], ['about 200 videos'], ['200 views']])), null);
  assert.equal(readPlaylistLength(undefined), null);
  assert.equal(parsePlaylistData(browse([lockup('aaaaaaaaaaa', 'A')], { header: pageHeader([['Owner'], ['7 videos']]) })).playlistLength, 7);
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

test('a playlist neither path can read throws ExtractionError, never the sample songs', async () => {
  const calls = stubFetch((url) => (url.includes('youtubei')
    ? Response.json({ alerts: [{ alertRenderer: { type: 'ERROR' } }] })
    : new Response('<html>no data</html>', { status: 200 })));
  await assert.rejects(fetchPlaylistItems('PLdoesnotexist000'), ExtractionError);
  assert.equal(calls.length, 2);

  stubFetch(() => new Response('gone', { status: 404 }));
  await assert.rejects(fetchPlaylistItems('PLdoesnotexist000'), ExtractionError);
});

test('the page scrape is tried when Innertube yields no items, and gets the same counts', async () => {
  const data = browse([lockup('aaaaaaaaaaa', 'A'), lockup('bbbbbbbbbbb', 'B', { isPlayable: false }), continuation], {
    header: pageHeader([['Owner'], ['150 videos']]),
  });
  stubFetch((url) => (url.includes('youtubei')
    ? Response.json(browse([]))
    : new Response(`<script>var ytInitialData = ${JSON.stringify(data)};</script>`, { status: 200 })));
  const out = await fetchPlaylistItems('PLsomething00');
  assert.equal(out.isDemo, false);
  assert.deepEqual(
    [out.returnedCount, out.loadedCount, out.unavailableCount, out.truncated, out.playlistLength],
    [1, 2, 1, true, 150],
  );
});

test('the preset sample id still returns the sample playlist, without a fetch', async () => {
  const calls = stubFetch(() => new Response('should not happen'));
  const out = await fetchPlaylistItems('PLosu_banger_showcase_01');
  assert.equal(out.isDemo, true);
  assert.equal(out.truncated, false);
  assert.equal(calls.length, 0);
});

test('extractMusicData carries the window counts for YouTube, and plain counts for other sources', async () => {
  stubFetch(() => Response.json(browse(
    [lockup('aaaaaaaaaaa', 'YOASOBI - Idol'), lockup('bbbbbbbbbbb', 'x', { isPlayable: false }), continuation],
    { header: pageHeader([['200 videos']]) },
  )));
  const yt = await extractMusicData('https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj');
  assert.deepEqual(
    [yt.returnedCount, yt.loadedCount, yt.unavailableCount, yt.truncated, yt.playlistLength],
    [1, 2, 1, true, 200],
  );

  const q = await extractMusicData('YOASOBI - Idol');
  assert.deepEqual(
    [q.returnedCount, q.loadedCount, q.unavailableCount, q.truncated, q.playlistLength],
    [1, 1, 0, false, null],
  );
});
