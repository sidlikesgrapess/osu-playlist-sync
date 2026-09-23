import { NextResponse } from 'next/server';
import { getUserBeatmapCollection, getOsuAccessToken } from '@/lib/osu';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { ValidationError, boundedString, positiveIntId } from '@/lib/validate';
import { toRouteError, demoResponse } from '@/lib/osuRoute';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['best', 'most_played', 'favourite'];

export async function GET(request) {
  const rate = checkRateLimit(request, { bucket: 'osuPlayerBeatmaps', limit: 20, windowMs: 60_000 });
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec);

  try {
    const { searchParams } = new URL(request.url);
    const userId = positiveIntId((searchParams.get('userId') || '').trim(), { name: 'userId' });
    const type = (searchParams.get('type') || '').trim();
    if (!VALID_TYPES.includes(type)) {
      throw new ValidationError(`type must be one of ${VALID_TYPES.join(', ')}`);
    }
    const mode = boundedString((searchParams.get('mode') || 'all').trim(), { name: 'mode', max: 20 });
    const limit = Math.min(100, Math.max(1, Math.floor(Number(searchParams.get('limit')) || 100)));

    if (!(await getOsuAccessToken())) return demoResponse({ items: [] });

    // Unfiltered and undeduped (F-12): the page filters by mode and status itself, so only
    // `best`, whose upstream endpoint takes the ruleset, depends on `mode` here.
    const { items, fetched, total } = await getUserBeatmapCollection(userId, type, { limit, mode });

    return NextResponse.json({ type, items, fetched, total });
  } catch (error) {
    return toRouteError(error, { notFoundMessage: 'No osu! player found with that id.' });
  }
}
