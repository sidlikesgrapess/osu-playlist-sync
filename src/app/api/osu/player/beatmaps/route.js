import { NextResponse } from 'next/server';
import { getUserBeatmapCollection } from '@/lib/osu';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['best', 'most_played', 'favourite'];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get('userId') || '').trim();
  const type = (searchParams.get('type') || '').trim();
  const mode = (searchParams.get('mode') || 'all').trim();
  const status = (searchParams.get('status') || 'any').trim();
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 100));

  if (!userId || !VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: 'Parameters "userId" and a valid "type" are required' },
      { status: 400 }
    );
  }

  try {
    const { items, fetched } = await getUserBeatmapCollection(userId, type, { limit, mode, status });

    return NextResponse.json({ type, items, fetched });
  } catch (error) {
    const status = error?.status === 429 ? 429 : 500;
    console.error('[osu! Player Beatmaps API Error]:', error?.status || '', error?.message || error);
    return NextResponse.json(
      {
        error: status === 429
          ? 'osu! API rate limit reached. Please wait a moment and try again.'
          : error?.message || 'Internal server error while querying the osu! API',
      },
      { status }
    );
  }
}
