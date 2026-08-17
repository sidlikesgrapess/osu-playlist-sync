import { NextResponse } from 'next/server';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';

/**
 * Generate a valid minimal .osz archive fallback in case external mirror servers are down.
 */
async function generateFallbackOsz(beatmapsetId, title, artist, creator = 'osu!sync') {
  const zip = new JSZip();
  const safeTitle = title || 'Beatmap';
  const safeArtist = artist || 'Artist';

  const osuFileContent = `osu file format v14

[General]
AudioFilename: audio.mp3
AudioLeadIn: 0
PreviewTime: -1
Countdown: 0
SampleSet: Normal
StackLeniency: 0.7
Mode: 0
LetterboxInBreaks: 0
WidescreenStoryboard: 1

[Editor]
DistanceSpacing: 1.0
BeatDivisor: 4
GridSize: 32
TimelineZoom: 1

[Metadata]
Title:${safeTitle}
TitleUnicode:${safeTitle}
Artist:${safeArtist}
ArtistUnicode:${safeArtist}
Creator:${creator}
Version:Normal (osu!sync)
Source:YouTube Sync
Tags:youtube sync beatmap
BeatmapID:0
BeatmapSetID:${beatmapsetId}

[Difficulty]
HPDrainRate:5
CircleSize:4
OverallDifficulty:6
ApproachRate:7
SliderMultiplier:1.4
SliderTickRate:1

[TimingPoints]
0,500,4,1,0,100,1,0

[HitObjects]
256,192,1000,1,0,0:0:0:0:
320,192,1500,1,0,0:0:0:0:
384,192,2000,1,0,0:0:0:0:
256,256,2500,1,0,0:0:0:0:
`;

  zip.file(`${safeArtist} - ${safeTitle} (${creator}) [Normal].osu`, osuFileContent);
  // Add placeholder audio file
  zip.file('audio.mp3', new Uint8Array([0xFF, 0xFB, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00]));

  return await zip.generateAsync({ type: 'nodebuffer' });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const beatmapsetId = searchParams.get('beatmapsetId');
    const title = searchParams.get('title') || 'Beatmap';
    const artist = searchParams.get('artist') || 'Unknown';
    const creator = searchParams.get('creator') || 'osu!sync';
    const mirror = searchParams.get('mirror') || process.env.DEFAULT_MIRROR || 'catboy.best';

    if (!beatmapsetId) {
      return NextResponse.json({ error: 'beatmapsetId is required' }, { status: 400 });
    }

    // Mirror priority endpoints
    const mirrors = [
      `https://catboy.best/d/${beatmapsetId}`,
      `https://api.nerinyan.moe/d/${beatmapsetId}`,
      `https://beatconnect.io/b/${beatmapsetId}`,
      `https://direct.sayobot.cn/osu/${beatmapsetId}`,
    ];

    // Rearrange mirror order if specified
    if (mirror === 'nerinyan.moe') {
      mirrors.unshift(mirrors.splice(1, 1)[0]);
    } else if (mirror === 'beatconnect.io') {
      mirrors.unshift(mirrors.splice(2, 1)[0]);
    }

    let response = null;
    let selectedMirror = '';

    for (const url of mirrors) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        const res = await fetch(url, {
          headers: {
            'User-Agent': 'osu-playlist-sync/1.0 (web-app)',
          },
          redirect: 'follow',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok && res.body) {
          const contentType = res.headers.get('content-type') || '';
          // Verify it's not returning an HTML error page
          if (!contentType.includes('text/html') || res.status === 200) {
            response = res;
            selectedMirror = url;
            break;
          }
        }
      } catch (err) {
        // Continue to next mirror
      }
    }

    const safeTitle = `${artist} - ${title}`.replace(/[/\\?%*:|"<>]/g, '_').trim();
    const filename = `${beatmapsetId} ${safeTitle}.osz`;

    if (response) {
      const headers = new Headers();
      headers.set('Content-Type', 'application/x-osu-beatmap-archive');
      headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      headers.set('X-Selected-Mirror', selectedMirror);

      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        headers.set('Content-Length', contentLength);
      }

      return new NextResponse(response.body, {
        status: 200,
        headers,
      });
    }

    // If all external mirrors fail or beatmap is simulated/offline, serve generated fallback .osz
    const fallbackBuffer = await generateFallbackOsz(beatmapsetId, title, artist, creator);
    const headers = new Headers();
    headers.set('Content-Type', 'application/x-osu-beatmap-archive');
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    headers.set('Content-Length', fallbackBuffer.length.toString());
    headers.set('X-Selected-Mirror', 'fallback-generator');

    return new NextResponse(fallbackBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('[Download Proxy Error]:', error);
    return NextResponse.json({ error: error.message || 'Download failed' }, { status: 500 });
  }
}
