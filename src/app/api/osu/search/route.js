import { NextResponse } from 'next/server';
import { searchOsuBeatmaps, getOsuAccessToken } from '@/lib/osu';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { ValidationError, boundedString, boundedStringArray } from '@/lib/validate';
import { toRouteError, demoResponse } from '@/lib/osuRoute';
import { cleanSongTitle } from '@/lib/titleCleaner';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const rate = checkRateLimit(request, { bucket: 'osuSearch', limit: 60, windowMs: 60_000 });
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec);

  try {
    const { searchParams } = new URL(request.url);
    const query = boundedString(searchParams.get('q'), { name: 'q', max: 500, required: false });
    let title = boundedString(searchParams.get('title'), { name: 'title', max: 500, required: false });
    let artist = boundedString(searchParams.get('artist'), { name: 'artist', max: 500, required: false });
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
      rawQueries.push(cleaned.cleanQuery, ...cleaned.fallbacks, ...cleaned.queries);
    }
    const extraQueries = boundedStringArray(
      Array.from(new Set(rawQueries.filter(Boolean))),
      { name: 'fallbacks', maxItems: 8, maxLen: 200 },
    );

    if (!(await getOsuAccessToken())) return demoResponse({ beatmapsets: [] });

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
    });

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
  } catch (error) {
    return toRouteError(error, { notFoundMessage: 'No beatmaps found' });
  }
}
