import { NextRequest, NextResponse } from 'next/server';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(): string {
  return Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

export const dynamic = 'force-dynamic';

const limiter = new Map<string, { count: number; reset: number }>();
function checkLimit(ip: string, max: number): boolean {
  const now = Date.now();
  const e = limiter.get(ip);
  if (!e || now > e.reset) {
    limiter.set(ip, { count: 1, reset: now + 60000 });
    return true;
  }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip, 10)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const callType = body.callType === 'audio' ? 'audio' : 'video';
  const deviceId = String(body.deviceId ?? 'unknown').substring(0, 64);
  const roomCode = genCode();

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error: dbError } = await supabase.from('group_rooms').insert({
      room_code: roomCode,
      host_device_id: deviceId,
      call_type: callType,
      status: 'waiting',
    });
    if (dbError) {
      console.error('[GroupCall] DB insert error:', dbError);
      return NextResponse.json({ error: 'Failed to create room' }, { status: 500 });
    }
  } catch (e) {
    console.error('[GroupCall] DB create error:', e);
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 });
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
