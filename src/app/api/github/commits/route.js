import { NextResponse } from 'next/server';

const REPO = 'sidlikesgrapess/osu-playlist-sync';
const COMMIT_COUNT = 5;

// The route itself always runs (otherwise the commit list would freeze at build
// time), but the GitHub call is cached for an hour — unauthenticated reads are
// capped at 60/hour per IP.
export const dynamic = 'force-dynamic';
const REVALIDATE_SECONDS = 3600;

/** Splits a conventional-commit subject into its type and human-readable part. */
function parseSubject(message) {
  const subject = String(message || '').split('\n')[0].trim();
  const match = subject.match(/^(\w+)(?:\([^)]*\))?:\s*(.+)$/);

  if (!match) return { type: null, text: subject };
  return { type: match[1].toLowerCase(), text: match[2] };
}

export async function GET() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/commits?per_page=${COMMIT_COUNT}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'osu-playlist-sync',
        },
        next: { revalidate: REVALIDATE_SECONDS },
      }
    );

    if (!res.ok) {
      console.warn('[GitHub commits] responded', res.status);
      return NextResponse.json({ commits: [] });
    }

    const data = await res.json();
    const commits = (Array.isArray(data) ? data : []).map(entry => {
      const { type, text } = parseSubject(entry?.commit?.message);
      return {
        sha: entry.sha?.slice(0, 7),
        type,
        text,
        date: entry?.commit?.author?.date || null,
        url: entry.html_url,
      };
    });

    return NextResponse.json({ commits });
  } catch (error) {
    console.warn('[GitHub commits] fetch failed:', error?.message || error);
    return NextResponse.json({ commits: [] });
  }
}
