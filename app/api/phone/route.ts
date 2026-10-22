import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lenient → E.164. Keeps a leading +, strips separators; if no country code and
// it looks like a 10-digit Colombian mobile, default to +57 (the core market).
function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  let e164: string;
  if (hasPlus) {
    e164 = "+" + digits;
  } else if (digits.length === 10) {
    e164 = "+57" + digits; // Colombian mobile default
  } else {
    e164 = "+" + digits; // assume caller included the country code
  }
  // E.164: + followed by 8–15 digits.
  return /^\+\d{8,15}$/.test(e164) ? e164 : null;
}

// POST /api/phone  { deviceId, phone, userId? }
// Save this device's phone so premium callers can reach it via WhatsApp/SMS when
// the app is closed. Universal (being reachable is free); the SENDING is premium.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`phone:${ip}`, 20, 60000);
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const b = await req.json().catch(() => null);
  if (!b || typeof b.deviceId !== "string") {
    return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
  }
  const phone = normalizePhone(b.phone);
  if (!phone) {
    return NextResponse.json({ ok: false, error: "invalid phone" }, { status: 400 });
  }
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const { error } = await admin.from("user_phones").upsert(
    {
      device_id: b.deviceId.slice(0, 64),
      phone,
      user_id: typeof b.userId === "string" && UUID_RE.test(b.userId) ? b.userId : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" },
  );
  if (error) {
    console.error("[phone] save", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, phone });
}

// GET /api/phone?deviceId=... → whether this device has a saved number (for UI
// gating). Returns only existence + a masked tail, never the full number.
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId") || "";
  if (!deviceId) return NextResponse.json({ hasPhone: false });
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ hasPhone: false });
  const { data } = await admin
    .from("user_phones")
    .select("phone")
    .eq("device_id", deviceId.slice(0, 64))
    .maybeSingle();
  if (!data?.phone) return NextResponse.json({ hasPhone: false });
  return NextResponse.json({ hasPhone: true, tail: data.phone.slice(-4) });
}
