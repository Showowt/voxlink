import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// CALL HISTORY (durable, cross-device)
// One row per call in the `conversations` table (keyed by room_code). Records
// who/when/language/mode/duration + a bounded transcript so a user's call log
// survives reinstall and syncs across their devices. Anon client + permissive
// RLS (mirrors contacts); no auth needed — device id is the identity.
// ─────────────────────────────────────────────────────────────────────────────

const SENTINEL_NAMES = new Set(["", "user", "partner", "unknown", "someone"]);
function meaningfulName(n: unknown): string | null {
  if (typeof n !== "string") return null;
  const t = n.trim();
  return t && !SENTINEL_NAMES.has(t.toLowerCase()) ? t.slice(0, 60) : null;
}

// POST /api/history — save/refresh one call.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`hist:${ip}`, 60, 60000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  try {
    const body = await req.json();
    const {
      deviceId,
      partnerDeviceId,
      partnerName,
      languagePair,
      mode,
      roomCode,
      durationSeconds,
      transcript,
    } = body;

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: "Storage not configured" }, { status: 503 });
    }
    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ success: false, error: "deviceId required" }, { status: 400 });
    }
    if (!roomCode || typeof roomCode !== "string") {
      return NextResponse.json({ success: false, error: "roomCode required" }, { status: 400 });
    }

    // Bounded transcript (both row size and turn count).
    const turns = Array.isArray(transcript) ? transcript.slice(-120) : [];

    // participant_2 + language_pair are NOT NULL in the schema — never send null.
    const row = {
      room_code: roomCode.slice(0, 24),
      participant_1: deviceId,
      participant_2:
        typeof partnerDeviceId === "string" && partnerDeviceId ? partnerDeviceId : "unknown",
      language_pair:
        typeof languagePair === "string" && languagePair ? languagePair.slice(0, 20) : "en",
      mode: mode === "audio" ? "audio" : "video",
      status: "ended",
      partner_name: meaningfulName(partnerName),
      duration_seconds:
        typeof durationSeconds === "number" && Number.isFinite(durationSeconds)
          ? Math.max(0, Math.floor(durationSeconds))
          : null,
      transcript: turns,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // NOTE: created_at intentionally omitted so an upsert-update preserves it.
    };

    const { error } = await supabase
      .from("conversations")
      .upsert(row, { onConflict: "room_code" });

    if (error) {
      console.error("[history POST]", error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[history POST]", e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// GET /api/history?deviceId=xxx  → recent calls (no transcript)
// GET /api/history?id=uuid       → one call, with transcript
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`hist:${ip}`, 120, 60000);
  if (!rl.allowed) return NextResponse.json({ calls: [] }, { status: 429 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ call: null });
    return NextResponse.json({ call: data });
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ calls: [] });

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, room_code, participant_1, participant_2, partner_name, language_pair, mode, duration_seconds, created_at, ended_at",
    )
    .or(`participant_1.eq.${deviceId},participant_2.eq.${deviceId}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[history GET]", error.message);
    return NextResponse.json({ calls: [] });
  }
  return NextResponse.json({ calls: data || [] });
}
