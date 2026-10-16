import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// POST /api/ring/send — persist a ring invite so the callee can PULL it even
// when its realtime socket is dead (store-and-forward, see migration). Called
// by the caller alongside the broadcast; the 2.5s re-ring loop upserts (one
// live row per room+address).
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`ringsend:${ip}`, 120, 60000);
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const b = await req.json().catch(() => null);
  if (!b || typeof b.room !== "string" || typeof b.toAddress !== "string" || typeof b.fromDevice !== "string") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const room = b.room.slice(0, 24);
  const toAddress = b.toAddress.slice(0, 64);
  const nowIso = new Date().toISOString();
  const fields = {
    from_device: b.fromDevice.slice(0, 64),
    from_name: typeof b.fromName === "string" ? b.fromName.slice(0, 60) : null,
    from_lang: typeof b.fromLang === "string" ? b.fromLang.slice(0, 8) : null,
    type: b.type === "audio" ? "audio" : "video",
    target_lang: typeof b.targetLang === "string" ? b.targetLang.slice(0, 8) : null,
    updated_at: nowIso,
  };
  // STICKY STATUS: only (re)set 'ringing' on a row that is still ringing — a
  // re-ring tick must NOT revive a row the callee already claimed or the caller
  // canceled (which would re-ring a dead/answered call). Update-if-ringing,
  // else insert fresh; a unique-violation on insert = terminal row exists, so
  // leave it.
  const { data: updated, error: updErr } = await admin
    .from("ring_invites")
    .update({ ...fields, status: "ringing" })
    .eq("room", room)
    .eq("to_address", toAddress)
    .eq("status", "ringing")
    .select("id");
  if (updErr) console.error("[ring/send] update", updErr.message);
  if (!updated || updated.length === 0) {
    const { error: insErr } = await admin
      .from("ring_invites")
      .insert({ room, to_address: toAddress, status: "ringing", created_at: nowIso, ...fields });
    // 23505 = row already exists in a terminal state — intentionally not revived.
    if (insErr && insErr.code !== "23505") console.error("[ring/send] insert", insErr.message);
  }
  return NextResponse.json({ ok: true });
}
