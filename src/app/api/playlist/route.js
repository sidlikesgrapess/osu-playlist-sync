import { NextResponse } from 'next/server';
import { extractMusicData } from '@/lib/extractors';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryOrUrl = searchParams.get('url') || searchParams.get('playlistId') || searchParams.get('q');

    if (!queryOrUrl) {
      return NextResponse.json(
        { error: 'Please enter a playlist link, track URL, or song title' },
        { status: 400 }
      );
    }

    const musicData = await extractMusicData(queryOrUrl);
    return NextResponse.json(musicData);
  } catch (error) {
    console.error('[Music Extractor Error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to extract playlist or track data' },
      { status: 500 }
    );
  }
}
