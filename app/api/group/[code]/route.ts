import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: rawCode } = await params;
  const code = rawCode?.toUpperCase();
  if (!code || code.length !== 6) {
    return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from('group_rooms')
      .select('room_code,call_type,status,participant_slots,max_participants')
      .eq('room_code', code)
      .single();

    if (!data) {
      return NextResponse.json({ roomCode: code, status: 'waiting', callType: 'video', participantCount: 0, maxParticipants: 4, exists: false });
    }

    const slots = Array.isArray(data.participant_slots) ? data.participant_slots : [];
    const active = slots.filter((s: unknown) => s !== null).length;
    return NextResponse.json({
      roomCode: data.room_code,
      status: data.status,
      callType: data.call_type,
      participantCount: active,
      maxParticipants: data.max_participants ?? 4,
      exists: true,
      isFull: active >= (data.max_participants ?? 4),
    });
  } catch {
    return NextResponse.json({ roomCode: code, status: 'waiting', callType: 'video', participantCount: 0, maxParticipants: 4, exists: false });
  }
}
