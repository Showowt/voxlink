import { NextRequest, NextResponse } from 'next/server';

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
  if (!checkLimit(ip, 30)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const roomCode = String(body.roomCode ?? '').toUpperCase();
  const slotIndex = Number(body.slotIndex ?? -1);

  if (!roomCode || roomCode.length !== 6 || slotIndex < 0 || slotIndex > 3) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: room } = await supabase
      .from('group_rooms')
      .select('participant_slots')
      .eq('room_code', roomCode)
      .single();

    if (!room) {
      return NextResponse.json({ ok: true });
    }

    const slots: (unknown | null)[] = Array.isArray(room.participant_slots)
      ? room.participant_slots
      : [null, null, null, null];

    // Clear the slot
    slots[slotIndex] = null;

    const activeCount = slots.filter(s => s !== null).length;

    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    await supabase
      .from('group_rooms')
      .update({
        participant_slots: slots,
        status: activeCount === 0 ? 'waiting' : 'active',
        expires_at: activeCount === 0 ? new Date(Date.now() + TWO_HOURS_MS).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('room_code', roomCode);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[GroupCall] Leave error:', e);
    return NextResponse.json({ ok: true });
  }
}
