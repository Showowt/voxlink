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
      mode: mode === "audio" || mode === "group" ? mode : "video",
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

    // One row PER PARTICIPANT per call — each device owns its own history entry
    // (correct partner_name + own-perspective transcript), rather than both
    // sides colliding into one shared room_code row.
    const { error } = await supabase
      .from("conversations")
      .upsert(row, { onConflict: "participant_1,room_code" });

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
    // Ownership check: transcripts are private. Without matching the caller's
    // deviceId to participant_1, any leaked row id read ANY call's transcript.
    const requester = req.nextUrl.searchParams.get("deviceId") || "";
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ call: null });
    if (!requester || data.participant_1 !== requester) {
      return NextResponse.json({ call: null });
    }
    return NextResponse.json({ call: data });
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) return NextResponse.json({ calls: [] });

  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, room_code, participant_1, participant_2, partner_name, language_pair, mode, duration_seconds, created_at, ended_at",
    )
    .eq("participant_1", deviceId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[history GET]", error.message);
    return NextResponse.json({ calls: [] });
  }

  // Enrich from the dial directory: a partner whose name never travelled over
  // the in-call handshake (common for link-joiners who skipped the name
  // prompt) still has a directory row — use its display_name, and ALWAYS
  // attach their dial code so the UI can render a callable identity instead
  // of a dead "Unknown".
  const calls = data || [];
  try {
    const partnerIds = Array.from(
      new Set(
        calls
          .map((c) => c.participant_2)
          .filter((p) => typeof p === "string" && p.length >= 8 && p !== "unknown"),
      ),
    );
    if (partnerIds.length) {
      const { supabaseAdmin } = await import("@/lib/supabase-admin");
      const admin = supabaseAdmin();
      if (admin) {
        const { data: dirs } = await admin
          .from("dial_directory")
          .select("device_id, display_name, dial_code")
          .in("device_id", partnerIds);
        const byId = new Map((dirs || []).map((d) => [d.device_id, d]));

        // DRIFT HEALING: a partner whose stored id is NO LONGER in the directory
        // has re-registered under a NEW device id (reinstall / storage wipe) —
        // History would otherwise dial the dead old id forever. Re-resolve by
        // display_name, but ONLY when it maps to exactly ONE current device
        // (unambiguous) so we never mis-dial a different person with the same name.
        const driftedNames = Array.from(
          new Set(
            calls
              .filter(
                (c) =>
                  typeof c.participant_2 === "string" &&
                  c.participant_2.length >= 8 &&
                  c.participant_2 !== "unknown" &&
                  !byId.has(c.participant_2) &&
                  meaningfulName(c.partner_name),
              )
              .map((c) => meaningfulName(c.partner_name) as string),
          ),
        );
        const byName = new Map<string, { device_id: string; dial_code: string | null }>();
        if (driftedNames.length) {
          const { data: nameRows } = await admin
            .from("dial_directory")
            .select("device_id, display_name, dial_code, updated_at")
            .in("display_name", driftedNames)
            .order("updated_at", { ascending: false });
          const distinct = new Map<string, Set<string>>();
          const latest = new Map<string, { device_id: string; dial_code: string | null }>();
          for (const r of nameRows || []) {
            const n = r.display_name as string;
            if (!distinct.has(n)) {
              distinct.set(n, new Set());
              latest.set(n, { device_id: r.device_id, dial_code: r.dial_code });
            }
            distinct.get(n)!.add(r.device_id);
          }
          Array.from(distinct.entries()).forEach(([n, set]) => {
            if (set.size === 1) byName.set(n, latest.get(n)!); // unambiguous only
          });
        }

        for (const c of calls as Array<Record<string, unknown>>) {
          const dir = byId.get(c.participant_2 as string);
          if (dir) {
            if (!c.partner_name && meaningfulName(dir.display_name)) {
              c.partner_name = meaningfulName(dir.display_name);
            }
            c.partner_code = dir.dial_code || null;
            c.partner_current_device = c.participant_2; // stored id is still live
          } else {
            // Stored id drifted out of the directory — use the unambiguous
            // name re-resolution if we found one; otherwise leave as-is.
            const nm = meaningfulName(c.partner_name);
            const rr = nm ? byName.get(nm) : undefined;
            if (rr) {
              c.partner_current_device = rr.device_id;
              c.partner_code = rr.dial_code || null;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("[history GET] enrich failed:", e);
  }
  return NextResponse.json({ calls });
}
