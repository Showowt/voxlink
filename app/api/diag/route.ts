import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const ALLOWED_STEPS = new Set([
  "invite-sent",
  "invite-received",
  "invite-accepted",
  "invite-declined",
  "auto-join-blocked",
  "joined-room",
  "partner-connected",
  "call-error",
  "ring-rebuilt",
]);

// POST /api/diag — call-chain telemetry from real devices (see app/lib/diag.ts).
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`diag:${ip}`, 120, 60000);
  if (!rl.allowed) return NextResponse.json({ ok: false }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.step !== "string" || !ALLOWED_STEPS.has(body.step)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  await admin
    .from("diag_events")
    .insert({
      device_id: typeof body.deviceId === "string" ? body.deviceId.slice(0, 64) : null,
      step: body.step.slice(0, 40),
      room: typeof body.room === "string" ? body.room.slice(0, 24) : null,
      detail: body.detail && typeof body.detail === "object" ? body.detail : null,
      ua: typeof body.ua === "string" ? body.ua.slice(0, 20) : null,
    })
    .then(({ error }) => {
      if (error) console.error("[diag]", error.message);
    });
  return NextResponse.json({ ok: true });
}
