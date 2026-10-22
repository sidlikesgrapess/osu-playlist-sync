import { extractMusicData, ExtractionError } from '@/lib/extractors';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { boundedString, ValidationError } from '@/lib/validate';
import { classifyInput } from '@/lib/platform';
import { extractPlaylistId } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

// Per client, per warm instance (rateLimit.js). Checked before anything else, so a flood of
// bad input is refused as cheaply as a flood of good input.
const RATE_LIMIT = { bucket: 'playlist', limit: 10, windowMs: 60_000 };

export async function GET(request) {
  const limited = checkRateLimit(request, RATE_LIMIT);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  try {
    const { searchParams } = new URL(request.url);
    const input = boundedString(
      searchParams.get('url') || searchParams.get('playlistId') || searchParams.get('q'),
      { name: 'A playlist link, track link or song title' },
    );

    const continuation = boundedString(searchParams.get('continuation'), {
      name: 'A YouTube continuation', max: 4096, required: false,
    });
    if (continuation && (classifyInput(input).kind !== 'youtube' || !extractPlaylistId(input))) {
      throw new ValidationError('A continuation needs a YouTube playlist link');
    }
    const musicData = await extractMusicData(input, { youtubeContinuation: continuation || null });
    return Response.json(musicData);
  } catch (error) {
    // The caller's own mistake: safe to say exactly what was wrong.
    if (error instanceof ValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    // A provider that could not be read. The message is ours, never the upstream's, and
    // extractionFailed is its own flag so it is never mistaken for demo data.
    if (error instanceof ExtractionError) {
      console.warn('[playlist] extraction failed:', error.cause?.message || error.message);
      return Response.json({ extractionFailed: true, error: error.message }, { status: 502 });
    }
    console.error('[playlist] unexpected error:', error);
    return Response.json(
      { extractionFailed: true, error: 'Could not read that link right now. Try again in a moment.' },
      { status: 502 },
    );
  }
}
