import { NextResponse } from 'next/server';
import { BROWSER_MIRRORS } from '@/lib/mirrors';

export const dynamic = 'force-dynamic';

export async function GET() {
  const osuConfigured = Boolean(
    process.env.OSU_CLIENT_ID && 
    process.env.OSU_CLIENT_SECRET && 
    process.env.OSU_CLIENT_ID !== 'your_osu_client_id_here'
  );

  return NextResponse.json({
    status: 'ok',
    osuConfigured,
    readyForProduction: osuConfigured,
    // The mirror tried first. The order lives only in mirrors.js; there is no env override.
    defaultMirror: BROWSER_MIRRORS[0].name,
  });
}
