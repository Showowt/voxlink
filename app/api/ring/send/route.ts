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

  // Upsert keeps created_at stable on re-rings (so the 60s freshness window is
  // from the FIRST ring, capping ghost rings) while reviving status to ringing.
  await admin
    .from("ring_invites")
    .upsert(
      {
        room: b.room.slice(0, 24),
        to_address: b.toAddress.slice(0, 64),
        from_device: b.fromDevice.slice(0, 64),
        from_name: typeof b.fromName === "string" ? b.fromName.slice(0, 60) : null,
        from_lang: typeof b.fromLang === "string" ? b.fromLang.slice(0, 8) : null,
        type: b.type === "audio" ? "audio" : "video",
        target_lang: typeof b.targetLang === "string" ? b.targetLang.slice(0, 8) : null,
        status: "ringing",
      },
      { onConflict: "room,to_address", ignoreDuplicates: false },
    )
    .then(({ error }) => {
      if (error) console.error("[ring/send]", error.message);
    });
  return NextResponse.json({ ok: true });
}
