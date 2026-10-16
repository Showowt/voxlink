import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// GET /api/ring/pending?addresses=<id>,<code>
// The reliability backbone: the callee polls this (on foreground + every ~4s
// while open and not in a call). Returns invites created in the last 60s for
// any of the caller's listening addresses — ringing ones to ring, and recently
// canceled/claimed rooms so a shown ring is dismissed even if the realtime
// cancel was missed. Works over plain HTTP when every websocket is dead.
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  // Generous: a foregrounded phone polls every 4s on two addresses.
  const rl = await checkRateLimit(`ringpull:${ip}`, 240, 60000);
  if (!rl.allowed) return NextResponse.json({ ringing: [], canceled: [] }, { status: 429 });

  const raw = req.nextUrl.searchParams.get("addresses") || "";
  const addresses = raw
    .split(",")
    .map((a) => a.trim())
    .filter((a) => a.length >= 6 && a.length <= 64)
    .slice(0, 4);
  if (!addresses.length) return NextResponse.json({ ringing: [], canceled: [] });

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ringing: [], canceled: [] });

  // 90s window on updated_at (the re-ring loop bumps it) covers the 60-90s iOS
  // freeze: a late-waking callee rings as long as the caller is still ringing.
  const sinceIso = new Date(Date.now() - 90000).toISOString();
  const { data, error } = await admin
    .from("ring_invites")
    .select("room, to_address, from_device, from_name, from_lang, type, target_lang, status, updated_at")
    .in("to_address", addresses)
    .gte("updated_at", sinceIso)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[ring/pending]", error.message);
    return NextResponse.json({ ringing: [], canceled: [] });
  }

  const ringing = (data || [])
    .filter((r) => r.status === "ringing")
    .map((r) => ({
      room: r.room,
      type: r.type,
      fromDevice: r.from_device,
      fromName: r.from_name || "",
      fromLang: r.from_lang || "en",
      targetLang: r.target_lang || undefined,
      t: new Date(r.updated_at).getTime(),
    }));
  const canceled = (data || [])
    .filter((r) => r.status === "canceled" || r.status === "claimed")
    .map((r) => r.room);

  return NextResponse.json({ ringing, canceled });
}
