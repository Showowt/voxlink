import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// DIAL DIRECTORY
// A dial code is a one-way hash of a device id, so it cannot be reversed to a
// contact_device_id on its own. Every device publishes its own code → identity
// here on app open; a caller who only has the short code can then resolve it to
// a real device id + language, save a proper contact, and translate correctly
// from the first word. Ringing itself does NOT depend on this (the callee also
// listens on the code channel) — this only powers saving + language.
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/directory — register / refresh this device's identity.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`dir:${ip}`, 60, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const { deviceId, dialCode, displayName, language } = await req.json();
    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }
    if (!dialCode || typeof dialCode !== "string") {
      return NextResponse.json({ error: "dialCode required" }, { status: 400 });
    }

    const { error } = await supabase.from("dial_directory").upsert(
      {
        device_id: deviceId,
        dial_code: dialCode.toUpperCase().slice(0, 12),
        display_name:
          typeof displayName === "string" && displayName.trim()
            ? displayName.trim().slice(0, 60)
            : null,
        language: typeof language === "string" && language ? language.slice(0, 8) : "en",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" },
    );

    if (error) {
      console.error("[directory POST]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[directory POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// GET /api/directory?code=ABCDEF — resolve a dial code to identity.
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`dir:${ip}`, 60, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ found: false }, { status: 429 });
  }

  const code = (req.nextUrl.searchParams.get("code") || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 12);
  if (!code) return NextResponse.json({ found: false });

  const { data, error } = await supabase
    .from("dial_directory")
    .select("device_id, display_name, language")
    .eq("dial_code", code)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    deviceId: data.device_id,
    displayName: data.display_name || null,
    language: data.language || "en",
  });
}
