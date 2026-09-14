import { NextResponse } from 'next/server';
import { searchOsuUsers, getOsuUser, parseOsuProfileRef } from '@/lib/osu';

export const dynamic = 'force-dynamic';

function errorResponse(error) {
  const status = error?.status === 429 ? 429 : error?.status === 404 ? 404 : 500;
  const message = status === 429
    ? 'osu! API rate limit reached. Please wait a moment and try again.'
    : status === 404
    ? 'No osu! player found for that name or link.'
    : error?.message || 'Internal server error while querying the osu! API';

  console.error('[osu! Player API Error]:', error?.status || '', error?.message || error);
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  const userId = (searchParams.get('userId') || '').trim();
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  if (!query && !userId) {
    return NextResponse.json(
      { error: 'Query parameter "q" or "userId" is required' },
      { status: 400 }
    );
  }

  try {
    // Direct profile lookup (clicking a search result, a pasted profile link, or a raw id)
    const profileRef = userId || parseOsuProfileRef(query) || (/^\d+$/.test(query) ? query : null);

    if (profileRef) {
      const user = await getOsuUser(profileRef);
      if (!user) {
        return NextResponse.json(
          { error: 'osu! API is not configured on this deployment.' },
          { status: 503 }
        );
      }
      return NextResponse.json({ type: 'profile', user });
    }

    const { users, total } = await searchOsuUsers(query, page);
    return NextResponse.json({ type: 'results', users, total, page });
  } catch (error) {
    return errorResponse(error);
  }
}
