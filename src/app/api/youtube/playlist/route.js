import { NextResponse } from 'next/server';
import { extractPlaylistId, fetchPlaylistItems } from '@/lib/youtube';
import { cleanSongTitle } from '@/lib/titleCleaner';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const urlOrId = searchParams.get('url') || searchParams.get('playlistId');

    if (!urlOrId) {
      return NextResponse.json(
        { error: 'Please paste a YouTube playlist link' },
        { status: 400 }
      );
    }

    const playlistId = extractPlaylistId(urlOrId);
    if (!playlistId) {
      return NextResponse.json(
        { error: 'Could not find a valid playlist in that link. Please check the URL and try again.' },
        { status: 400 }
      );
    }

    const playlistData = await fetchPlaylistItems(playlistId);

    // Process and clean all song titles for osu! search
    const processedSongs = (playlistData.songs || []).map((song, index) => {
      const cleaned = cleanSongTitle(song.title, song.channelTitle);
      return {
        ...song,
        index: index + 1,
        cleanQuery: cleaned.cleanQuery,
        extractedArtist: cleaned.artist,
        extractedTitle: cleaned.title,
        fallbacks: cleaned.fallbacks,
        queries: cleaned.queries,
      };
    });

    return NextResponse.json({
      success: true,
      playlistId: playlistData.playlistId,
      playlistTitle: playlistData.playlistTitle,
      totalSongs: processedSongs.length,
      isDemo: playlistData.isDemo || false,
      songs: processedSongs,
    });
  } catch (error) {
    console.error('[YouTube API Error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to read YouTube playlist' },
      { status: 500 }
    );
  }
}
