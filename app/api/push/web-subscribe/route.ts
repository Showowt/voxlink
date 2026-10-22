import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deriveDialCode } from "@/app/lib/dial-code";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/push/web-subscribe
// Body: { deviceId, dialCode?, userId?, subscription: { endpoint, keys: { p256dh, auth } } }
// Stores a browser Web Push subscription so a CLOSED/backgrounded web phone can
// be woken for an incoming call (the web equivalent of registering a VoIP token).
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`websub:${ip}`, 60, 60000);
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const b = await req.json().catch(() => null);
  if (!b || typeof b.deviceId !== "string") {
    return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
  }
  const sub = b.subscription;
  const endpoint: unknown = sub?.endpoint;
  const p256dh: unknown = sub?.keys?.p256dh;
  const auth: unknown = sub?.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    !/^https:\/\//.test(endpoint) ||
    typeof p256dh !== "string" ||
    typeof auth !== "string"
  ) {
    return NextResponse.json({ ok: false, error: "invalid subscription" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const deviceId = b.deviceId.slice(0, 64);
  const row = {
    device_id: deviceId,
    // Derive the dial code SERVER-SIDE from the device id — never trust a
    // client-supplied code (it's how a caller is matched; a spoofed code could
    // misroute). Deterministic, so it always matches what a caller dials.
    dial_code: deriveDialCode(deviceId) || null,
    // user_id must be a real uuid or null — a bad string 500s the insert and
    // silently drops the subscription (no wake). Reject anything non-uuid.
    user_id: typeof b.userId === "string" && UUID_RE.test(b.userId) ? b.userId : null,
    endpoint: endpoint.slice(0, 1024),
    p256dh: p256dh.slice(0, 256),
    auth: auth.slice(0, 256),
    ua: (req.headers.get("user-agent") || "").slice(0, 200),
    updated_at: new Date().toISOString(),
  };

  // One row per endpoint; a device that re-subscribes (or whose id drifted)
  // updates the mapping in place.
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(row, { onConflict: "endpoint" });
  if (error) {
    console.error("[push/web-subscribe]", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
