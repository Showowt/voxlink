import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

    await supabase
      .from('group_rooms')
      .update({
        participant_slots: slots,
        status: activeCount === 0 ? 'ended' : 'active',
        ended_at: activeCount === 0 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('room_code', roomCode);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[GroupCall] Leave error:', e);
    return NextResponse.json({ ok: true });
  }
}
