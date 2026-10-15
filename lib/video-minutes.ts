// ═══════════════════════════════════════════════════════════════════════════════
// VIDEO MINUTES — monthly metering for the billed (Daily.co) video rail.
// Reads/writes daily_usage.video_minutes keyed by user_id (accounts) or
// session_id (anonymous device ids). Server-only.
//
// Enforcement model: the client reports elapsed minutes at call end
// (/api/usage/video, retried via the outbox), and /api/daily/room scales the
// room/token expiry to the REMAINING allowance — so even an un-reported call
// can't spend past the cap. Reporting keeps the running total honest between
// room creations.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from "./supabase-admin";

export function FREE_VIDEO_MINUTES(): number {
  const v = parseInt(process.env.FREE_VIDEO_MINUTES || "", 10);
  return Number.isFinite(v) && v >= 0 ? v : 10; // launch model: 10 min/month
}

function monthStartISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** Month-to-date billed video minutes for an identity (user and/or device). */
export async function getMonthlyVideoMinutes(
  userId: string | null,
  deviceId: string,
): Promise<number> {
  const admin = supabaseAdmin();
  if (!admin) return 0;
  try {
    let query = admin
      .from("daily_usage")
      .select("video_minutes")
      .gte("date", monthStartISO());
    if (userId && deviceId) {
      query = query.or(`user_id.eq.${userId},session_id.eq.${deviceId}`);
    } else if (userId) {
      query = query.eq("user_id", userId);
    } else if (deviceId) {
      query = query.eq("session_id", deviceId);
    } else {
      return 0;
    }
    const { data } = await query;
    return (data || []).reduce((sum, r) => sum + (r.video_minutes || 0), 0);
  } catch (err) {
    console.error("[VideoMinutes] read failed:", err);
    return 0; // metering failure must not block calls
  }
}

/** Add minutes to today's row for the identity (device preferred for anon). */
export async function addVideoMinutes(
  userId: string | null,
  deviceId: string,
  minutes: number,
): Promise<boolean> {
  const admin = supabaseAdmin();
  if (!admin || minutes <= 0) return false;
  const today = new Date().toISOString().slice(0, 10);
  const clamped = Math.min(240, Math.ceil(minutes)); // one report can't claim >4h
  try {
    const key = userId
      ? { col: "user_id" as const, val: userId, conflict: "user_id,date" }
      : { col: "session_id" as const, val: deviceId, conflict: "session_id,date" };
    if (!key.val) return false;

    const { data: existing } = await admin
      .from("daily_usage")
      .select("id, video_minutes")
      .eq(key.col, key.val)
      .eq("date", today)
      .maybeSingle();

    if (existing) {
      await admin
        .from("daily_usage")
        .update({ video_minutes: (existing.video_minutes || 0) + clamped })
        .eq("id", existing.id);
    } else {
      await admin.from("daily_usage").insert({
        [key.col]: key.val,
        date: today,
        video_minutes: clamped,
      });
    }
    return true;
  } catch (err) {
    console.error("[VideoMinutes] write failed:", err);
    return false;
  }
}
