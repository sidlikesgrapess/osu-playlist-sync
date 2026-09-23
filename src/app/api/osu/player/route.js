import { NextResponse } from 'next/server';
import { searchOsuUsers, getOsuUser, getOsuAccessToken, parseOsuProfileRef } from '@/lib/osu';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { ValidationError, boundedString, positiveIntId } from '@/lib/validate';
import { toRouteError, demoResponse } from '@/lib/osuRoute';

export const dynamic = 'force-dynamic';

const NOT_FOUND_MESSAGE = 'No osu! player found for that name or link.';

export async function GET(request) {
  const limit = checkRateLimit(request, { bucket: 'osuPlayer', limit: 20, windowMs: 60_000 });
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

  try {
    const { searchParams } = new URL(request.url);
    const query = boundedString((searchParams.get('q') || '').trim(), { name: 'q', max: 200, required: false });
    const userIdParam = (searchParams.get('userId') || '').trim();
    const userId = userIdParam ? positiveIntId(userIdParam, { name: 'userId' }) : null;
    const page = Math.min(200, Math.max(1, Math.floor(Number(searchParams.get('page')) || 1)));

    if (!query && !userId) {
      throw new ValidationError('Query parameter "q" or "userId" is required');
    }

    if (!(await getOsuAccessToken())) return demoResponse({ type: 'demo' });

    // Direct profile lookup (clicking a search result, a pasted profile link, or a raw id)
    const profileRef = userId || parseOsuProfileRef(query) || (/^\d+$/.test(query) ? query : null);

    if (profileRef) {
      const user = await getOsuUser(profileRef);
      if (!user) {
        const notFound = new Error('osu! returned no user');
        notFound.status = 404;
        throw notFound;
      }
      return NextResponse.json({ type: 'profile', user });
    }

    const { users, total } = await searchOsuUsers(query, page);
    return NextResponse.json({ type: 'results', users, total, page });
  } catch (error) {
    return toRouteError(error, { notFoundMessage: NOT_FOUND_MESSAGE });
  }
}
