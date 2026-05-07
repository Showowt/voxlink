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
  if (!checkLimit(ip, 20)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const roomCode = String(body.roomCode ?? '').toUpperCase();
  const deviceId = String(body.deviceId ?? '').substring(0, 64);
  const displayName = String(body.displayName ?? 'Guest').substring(0, 30);
  const language = String(body.language ?? 'en');

  if (!roomCode || roomCode.length !== 6) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Get current room state
    const { data: room } = await supabase
      .from('group_rooms')
      .select('*')
      .eq('room_code', roomCode)
      .single();

    if (!room) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    if (room.status === 'ended') {
      return NextResponse.json({ error: 'This room has ended' }, { status: 410 });
    }

    const slots: (unknown | null)[] = Array.isArray(room.participant_slots)
      ? room.participant_slots
      : [null, null, null, null];

    // Find first empty slot
    const slotIndex = slots.findIndex(s => s === null);
    if (slotIndex === -1) {
      return NextResponse.json({ error: 'Room is full (max 4 participants)' }, { status: 409 });
    }

    const peerId = `entrevoz-group-${roomCode}-slot${slotIndex}`;
    const newSlot = {
      deviceId,
      displayName,
      language,
      peerId,
      slotIndex,
      joinedAt: Date.now(),
    };

    // Atomically assign slot
    slots[slotIndex] = newSlot;

    const { error: updateError } = await supabase
      .from('group_rooms')
      .update({
        participant_slots: slots,
        status: 'active',
        started_at: room.started_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('room_code', roomCode);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to join room' }, { status: 500 });
    }

    // Return slot assignment + existing participants
    const existingParticipants = slots.filter((s, i) => s !== null && i !== slotIndex);

    return NextResponse.json({
      slotIndex,
      peerId,
      roomCode,
      participants: existingParticipants,
    });
  } catch (e) {
    console.error('[GroupCall] Join error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
