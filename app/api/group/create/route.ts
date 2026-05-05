import { NextRequest, NextResponse } from 'next/server';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const callType = body.callType === 'audio' ? 'audio' : 'video';
  const deviceId = String(body.deviceId ?? 'unknown').substring(0, 64);
  const roomCode = genCode();

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.from('group_rooms').insert({
      room_code: roomCode,
      host_device_id: deviceId,
      call_type: callType,
      status: 'waiting',
    });
  } catch (e) {
    console.error('[GroupCall] DB create error (non-fatal):', e);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://entrevoz.co';
  return NextResponse.json({
    roomCode,
    callType,
    joinUrl: `/group/${roomCode}?type=${callType}`,
    shareUrl: `${baseUrl}/group/${roomCode}?type=${callType}`,
    whatsappText: encodeURIComponent(
      `Join my translated group call - speak your language, everyone understands\n\nTap to join: ${baseUrl}/group/${roomCode}?type=${callType}\n\nNo download needed`
    ),
  });
}
