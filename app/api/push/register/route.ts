import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Stores a device's VoIP push token so a caller can ring it even when the app
// is closed. Keyed by device id AND dial code (a caller may target either).
// Requires a `push_tokens` table — see native/NATIVE_RING.md for the migration.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`pushreg:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const { deviceId, dialCode, token, platform } = await req.json();
    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }
    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }
    const admin = supabaseAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const { error } = await admin.from("push_tokens").upsert(
      {
        device_id: deviceId,
        dial_code: typeof dialCode === "string" ? dialCode : null,
        voip_token: token,
        platform: platform === "ios" ? "ios" : "ios",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" },
    );

    if (error) {
      console.error("[push/register]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[push/register]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
