import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// POST /api/ring/update { room, toAddress, status: 'canceled' | 'claimed' }
// Caller cancels (no-answer / hang-up / back) or callee claims (accepted), so
// the pull path dismisses a shown ring even if the realtime signal was missed.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`ringupd:${ip}`, 120, 60000);
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const b = await req.json().catch(() => null);
  const status = b?.status === "claimed" ? "claimed" : b?.status === "canceled" ? "canceled" : null;
  if (!b || typeof b.room !== "string" || typeof b.toAddress !== "string" || !status) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  await admin
    .from("ring_invites")
    .update({ status })
    .eq("room", b.room.slice(0, 24))
    .eq("to_address", b.toAddress.slice(0, 64))
    .then(({ error }) => {
      if (error) console.error("[ring/update]", error.message);
    });
  return NextResponse.json({ ok: true });
}
