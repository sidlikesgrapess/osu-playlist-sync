import { NextResponse } from 'next/server';
import { searchOsuBeatmaps } from '@/lib/osu';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const title = searchParams.get('title') || '';
    const artist = searchParams.get('artist') || '';
    const mode = searchParams.get('mode') || 'all';
    const status = searchParams.get('status') || 'ranked';
    const fallbackParam = searchParams.get('fallback');
    const fallbacksParam = searchParams.get('fallbacks');

    if (!query && !title) {
      return NextResponse.json(
        { error: 'Query parameter "q" or "title" is required' },
        { status: 400 }
      );
    }

    let extraQueries = [];
    if (fallbackParam) extraQueries.push(fallbackParam);
    if (fallbacksParam) {
      try {
        const parsed = JSON.parse(fallbacksParam);
        if (Array.isArray(parsed)) extraQueries.push(...parsed);
      } catch (e) {
        extraQueries.push(fallbacksParam);
      }
    }

    // Run smart scored search
    const result = await searchOsuBeatmaps(query || title, {
      title,
      artist,
      queries: extraQueries,
      mode,
      status,
    });

    return NextResponse.json({
      success: true,
      query: query || title,
      total: result.total || (result.beatmapsets ? result.beatmapsets.length : 0),
      bestScore: result.bestScore || 0,
      beatmapsets: result.beatmapsets || [],
      isDemo: result.isDemo || false,
    });
  } catch (error) {
    console.error('[osu! Search API Error]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error while querying osu! API' },
      { status: 500 }
    );
  }
}
