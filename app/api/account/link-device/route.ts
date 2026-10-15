import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// POST /api/account/link-device { deviceId, accessToken }
// Links an anonymous device id to a signed-in account so entitlements
// (Premium/trial) apply on device-keyed routes (voice, video, transcription)
// even when a request carries no auth session. Token is verified server-side —
// a client can only link a device to the account it actually holds a session
// for.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`link-device:${ip}`, 20, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";

  if (deviceId.length < 8 || deviceId.length > 64 || !accessToken) {
    return NextResponse.json({ error: "deviceId and accessToken required" }, { status: 400 });
  }

  const { data: userData, error: authErr } = await supabase.auth.getUser(accessToken);
  if (authErr || !userData?.user?.id) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { error } = await admin.from("device_accounts").upsert(
    {
      device_id: deviceId,
      user_id: userData.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" },
  );
  if (error) {
    console.error("[link-device]", error.message);
    return NextResponse.json({ error: "Link failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
