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
  "app-load",
  "foreground",
  "web-push-subscribed",
  // Media-connect funnel (video=Daily) — so a "both joined, no media" failure is
  // readable per-arrow from data instead of invisible:
  //   joined-room → daily-joined → daily-partner-seen → partner-connected
  "daily-joined", // SFU join succeeded
  "daily-join-failed", // room/token/join threw (detail.reason / detail.status)
  "daily-partner-seen", // remote participant-joined fired (media should follow)
  "daily-recover", // interruption recovery attempt (detail.result)
  "daily-left-meeting", // SFU connection died (interruption)
  "waiting-no-partner", // host/answerer alone >25s after join (genuine no-show vs bug)
  "gate-hit", // server-side video gate denied a join (detail.kind budget|minutes, side)
  "talk-relay-escalation", // audio/talk forced relay-only after 10s (Colombia symmetric NAT)
  "group-peer-seen", // group mesh: a remote peer's media arrived (detail.slot)
  "group-media-retry", // group mesh: media leg re-called after no stream (detail.slot, attempt)
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
