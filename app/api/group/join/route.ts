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
  const languageRaw = String(body.language ?? 'en');
  const language = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(languageRaw) ? languageRaw : 'en';
  // Per-session suffix → unique signaling id, so a quick rejoin never collides
  // with this device's previous, not-yet-expired registration. Optional:
  // clients from before it get the legacy deterministic id.
  const sessionTagRaw = String(body.sessionTag ?? '');
  const sessionTag = /^[a-z0-9]{4,16}$/.test(sessionTagRaw) ? sessionTagRaw : '';

  if (!roomCode || roomCode.length !== 6) {
    return NextResponse.json({ error: 'Invalid room code' }, { status: 400 });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Compare-and-swap on updated_at: two people joining at the same moment
    // used to read the same free slot and both claim it (same signaling id →
    // one of them silently never connected). A lost race re-reads and retries;
    // every write stays conditional — an unconditional write would clobber a
    // concurrent join/leave — and true exhaustion asks the client to retry.
    const MAX_ATTEMPTS = 6;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
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

      // Check if room expired (grace period passed)
      if (room.expires_at && new Date(room.expires_at) < new Date()) {
        await supabase.from('group_rooms').update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        }).eq('room_code', roomCode);
        return NextResponse.json({ error: 'This room has expired' }, { status: 410 });
      }

      const slots: (unknown | null)[] = Array.isArray(room.participant_slots)
        ? room.participant_slots.slice()
        : [null, null, null, null];

      // Idempotent rejoin: if this device already holds a slot (refresh,
      // reconnect, flaky network), reuse it — otherwise every retry consumed a
      // fresh slot and ghost entries filled the room.
      const existingIndex = slots.findIndex(
        (s) =>
          s !== null &&
          typeof s === 'object' &&
          (s as { deviceId?: string }).deviceId === deviceId,
      );

      // Find first empty slot (or reclaim our own)
      const slotIndex =
        existingIndex !== -1 ? existingIndex : slots.findIndex(s => s === null);
      if (slotIndex === -1) {
        return NextResponse.json({ error: 'Room is full (max 4 participants)' }, { status: 409 });
      }

      const peerId = sessionTag
        ? `entrevoz-group-${roomCode}-slot${slotIndex}-${sessionTag}`
        : `entrevoz-group-${roomCode}-slot${slotIndex}`;
      slots[slotIndex] = {
        deviceId,
        displayName,
        language,
        peerId,
        slotIndex,
        joinedAt: Date.now(),
      };

      const patch = {
        participant_slots: slots,
        status: 'active',
        started_at: room.started_at ?? new Date().toISOString(),
        expires_at: null,
        updated_at: new Date().toISOString(),
      };
      let query = supabase.from('group_rooms').update(patch).eq('room_code', roomCode);
      query = room.updated_at
        ? query.eq('updated_at', room.updated_at)
        : query.is('updated_at', null);
      const { data: written, error: updateError } = await query.select('room_code');

      if (updateError) {
        console.error('[GroupCall] Join update error:', updateError);
        return NextResponse.json({ error: 'Failed to join room' }, { status: 500 });
      }

      if (Array.isArray(written) && written.length > 0) {
        // Return slot assignment + everyone else already in the room
        const existingParticipants = slots.filter((s, i) => s !== null && i !== slotIndex);
        return NextResponse.json({
          slotIndex,
          peerId,
          roomCode,
          participants: existingParticipants,
        });
      }

      // Lost the race — someone else wrote first. Re-read and try again
      // (jittered so simultaneous joiners don't collide in lockstep).
      await new Promise((r) => setTimeout(r, 40 + attempt * 60 + Math.floor(Math.random() * 80)));
    }

    return NextResponse.json(
      { error: 'Room is busy — tap Retry. · La sala está ocupada — toca Reintentar.' },
      { status: 503 },
    );
  } catch (e) {
    console.error('[GroupCall] Join error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
