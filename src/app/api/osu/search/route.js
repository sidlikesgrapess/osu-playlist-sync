import { NextResponse } from 'next/server';
import { searchOsuBeatmaps, getOsuAccessToken } from '@/lib/osu';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { ValidationError, boundedString, boundedStringArray } from '@/lib/validate';
import { toRouteError, demoResponse } from '@/lib/osuRoute';
import { cleanSongTitle } from '@/lib/titleCleaner';

export const dynamic = 'force-dynamic';

const SEARCH_RATE_LIMIT = { bucket: 'osuSearch', limit: 60, windowMs: 60_000 };
const BATCH_RATE_LIMIT = { bucket: 'osuSearchBatch', limit: 60, windowMs: 60_000 };
const MAX_BATCH_SONGS = 10;
const MAX_BATCH_BYTES = 40_000;
const BATCH_DEADLINE_MS = 20_000;

// Leave time to serialize a partial response after the search deadline.
export const maxDuration = 30;

export async function GET(request) {
  const rate = checkRateLimit(request, SEARCH_RATE_LIMIT);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec);

  try {
    const { searchParams } = new URL(request.url);
    return await searchFromParams(searchParams);
  } catch (error) {
    return toRouteError(error, { notFoundMessage: 'No beatmaps found' });
  }
}

/** One browser request for a visible page; each song keeps its own validation and budget. */
export async function POST(request) {
  const rate = checkRateLimit(request, BATCH_RATE_LIMIT);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec);

  try {
    const reader = request.body?.getReader();
    if (!reader) throw new ValidationError('A search batch is required');
    let size = 0;
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BATCH_BYTES) {
        await reader.cancel().catch(() => {});
        throw new ValidationError('Search batch is too large');
      }
      chunks.push(value);
    }
    let batch;
    try {
      batch = JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8'));
    } catch {
      throw new ValidationError('Search batch must be valid JSON');
    }
    if (!Array.isArray(batch?.queries) || batch.queries.length < 1 || batch.queries.length > MAX_BATCH_SONGS) {
      throw new ValidationError(`Search batch must contain 1 to ${MAX_BATCH_SONGS} songs`);
    }
    const queries = batch.queries.map((item) => {
      if (typeof item?.id !== 'string' || typeof item?.params !== 'string') {
        throw new ValidationError('Each song needs a string id and search parameters');
      }
      return {
        id: boundedString(item.id, { name: 'Song id', max: 100 }),
        params: boundedString(item.params, { name: 'Search parameters', max: 4000 }),
      };
    });
    if (new Set(queries.map(item => item.id)).size !== queries.length) {
      throw new ValidationError('Search batch song ids must be unique');
    }

    const controller = new AbortController();
    const onDisconnect = () => controller.abort();
    request.signal.addEventListener('abort', onDisconnect, { once: true });
    const deadline = setTimeout(() => controller.abort(), BATCH_DEADLINE_MS);
    try {
      if (!(await getOsuAccessToken({ signal: controller.signal }))) {
        controller.signal.throwIfAborted();
        return demoResponse({ results: [] });
      }

      const results = new Array(queries.length);
      let next = 0;
      async function worker() {
        while (next < queries.length && !controller.signal.aborted) {
          const index = next++;
          const budget = checkRateLimit(request, SEARCH_RATE_LIMIT);
          if (!budget.ok) {
            results[index] = { id: queries[index].id, status: 429, retryAfterSec: budget.retryAfterSec, result: { error: 'Too many requests, try again shortly' } };
            continue;
          }
          const response = await searchFromParams(new URLSearchParams(queries[index].params), { signal: controller.signal })
            .catch(error => controller.signal.aborted
              ? NextResponse.json({ error: 'Search timed out' }, { status: 504 })
              : toRouteError(error, { notFoundMessage: 'No beatmaps found' }));
          results[index] = {
            id: queries[index].id,
            status: response.status,
            retryAfterSec: Number(response.headers.get('Retry-After')) || 0,
            result: await response.json(),
          };
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, queries.length) }, () => worker()));
      return NextResponse.json({ results: queries.map((query, index) => results[index] || {
        id: query.id, status: 504, result: { error: 'Search timed out' },
      }) });
    } finally {
      clearTimeout(deadline);
      request.signal.removeEventListener('abort', onDisconnect);
    }
  } catch (error) {
    return toRouteError(error);
  }
}

async function searchFromParams(searchParams, { signal } = {}) {
    const query = boundedString(searchParams.get('q'), { name: 'q', max: 500, required: false });
    let title = boundedString(searchParams.get('title'), { name: 'title', max: 500, required: false });
    let artist = boundedString(searchParams.get('artist'), { name: 'artist', max: 500, required: false });
    // F-46: the title with its ambiguous tags kept. searchOsuBeatmaps scores against both.
    let altTitle = boundedString(searchParams.get('altTitle'), { name: 'altTitle', max: 500, required: false });
    const mode = searchParams.get('mode') || 'all';
    const status = searchParams.get('status') || 'ranked';
    // Provenance of the artist string: decides whether a wrong-artist verdict may reject.
    const source = searchParams.get('source') || '';
    // Set when the song's artist was split out of its title rather than handed over by the
    // provider, so a Spotify/Apple source alone does not earn it a provider's trust (F-28).
    let artistFromTitle = searchParams.get('artistFromTitle') === '1';
    const fallbackParam = searchParams.get('fallback');
    const fallbacksParam = searchParams.get('fallbacks');
    // 0-100 Match Strictness. Deliberately NOT accepting the old `minScore` name: that was a
    // raw 0-150 score cutoff, so honouring it here would read 70 ("the old default") as 70
    // ("Strict") and quietly change what every stale client asks for.
    const strictnessParam = searchParams.get('strictness');
    const strictness = strictnessParam !== null ? Number(strictnessParam) : undefined;

    if (!query && !title) {
      throw new ValidationError('Query parameter "q" or "title" is required');
    }

    let rawQueries = [];
    if (fallbackParam) rawQueries.push(fallbackParam);
    if (fallbacksParam) {
      try {
        const parsed = JSON.parse(fallbacksParam);
        if (Array.isArray(parsed)) rawQueries.push(...parsed);
      } catch (e) {
        rawQueries.push(fallbacksParam);
      }
    }
    // Each variant is one upstream call, so the list is bounded here (F-14); searchOsuBeatmaps
    // then trims what survives dedupe to its own query budget.

    // A query the user typed arrives bare (F-05): the artist and title are derived here, with
    // the same cleaner the extractors use, so the client bundle does not carry it and
    // resolveArtistTrust decides how far the derived artist is trusted.
    if (source === 'query' && !artist && query) {
      const cleaned = cleanSongTitle(query, '', { source: 'query' });
      title = title || cleaned.title;
      artist = cleaned.artist;
      artistFromTitle = cleaned.artistFromTitle;
      altTitle = altTitle || cleaned.altTitle;
      rawQueries.push(cleaned.cleanQuery, ...cleaned.fallbacks, ...cleaned.queries);
    }
    const extraQueries = boundedStringArray(
      Array.from(new Set(rawQueries.filter(Boolean))),
      { name: 'fallbacks', maxItems: 8, maxLen: 200 },
    );

    if (!(await getOsuAccessToken({ signal }))) {
      signal?.throwIfAborted();
      return demoResponse({ beatmapsets: [] });
    }

    // Run smart scored search
    const result = await searchOsuBeatmaps(query || title, {
      title,
      artist,
      queries: extraQueries,
      mode,
      status,
      strictness,
      source,
      artistFromTitle,
      altTitle: altTitle || '',
      signal,
    });

    signal?.throwIfAborted();

    return NextResponse.json({
      success: true,
      query: query || title,
      total: result.total || (result.beatmapsets ? result.beatmapsets.length : 0),
      bestScore: result.bestScore || 0,
      beatmapsets: result.beatmapsets || [],
      isDemo: result.isDemo || false,
      // Why nothing came back, when nothing came back. Lets the UI distinguish
      // "no beatmaps found" from "found this song, but not by this artist".
      rejection: result.rejection || null,
      artistConfidence: result.artistConfidence || null,
    });
}
