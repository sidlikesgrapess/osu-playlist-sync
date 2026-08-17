import { NextResponse } from 'next/server';

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
    defaultMirror: process.env.DEFAULT_MIRROR || 'catboy.best',
  });
}
