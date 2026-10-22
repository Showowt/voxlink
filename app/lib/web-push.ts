// ═══════════════════════════════════════════════════════════════════════════════
// WEB PUSH (server) — the out-of-band WAKE for web/PWA callees. When a caller
// rings, we persist the invite (ring_invites) AND fire a Web Push to the
// callee's registered browser subscriptions. The push wakes a CLOSED or
// backgrounded phone; the push-only service worker shows a call notification and
// nudges the (re)opened tab to pull the pending invite and ring.
//
// This is the web equivalent of the native VoIP/APNs path and the piece that was
// missing — a closed web phone previously had NO way to be rung.
// ═══════════════════════════════════════════════════════════════════════════════

import webpush from "web-push";

const PUBLIC =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@entrevoz.co";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC || !PRIVATE) return false;
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
    configured = true;
    return true;
  } catch {
    return false;
  }
}

export function webPushConfigured(): boolean {
  return !!(PUBLIC && PRIVATE);
}

export interface RingPushPayload {
  room: string;
  type: "video" | "audio";
  fromName?: string;
  fromLang?: string;
  fromDevice?: string;
}

// Addresses are interpolated into a PostgREST .or() filter, so anything outside
// [A-Za-z0-9-] is an injection vector — reject it (device ids are uuid-ish,
// dial codes are [2-9A-Z], drift ids are alnum+dash: all pass).
function safeAddress(a: unknown): string | null {
  if (typeof a !== "string") return null;
  const s = a.trim().slice(0, 64);
  return s && /^[A-Za-z0-9-]+$/.test(s) ? s : null;
}

// Send an incoming-call web push to every subscription registered under
// `address` (a device id OR a dial code — the caller holds one of them).
// Best-effort + self-cleaning: expired endpoints (404/410) are deleted.
export async function sendRingWebPush(
  address: string,
  payload: RingPushPayload,
): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 };
  const addr = safeAddress(address);
  if (!addr) return { sent: 0, pruned: 0 };

  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const admin = supabaseAdmin();
  if (!admin) return { sent: 0, pruned: 0 };

  // SECURITY: resolve the dialed address to the callee's CURRENT device id and
  // push ONLY to subscriptions registered under that device id — NEVER by the
  // public dial code. A dial code is shareable/read-aloud by design, so pushing
  // by code would let anyone who knows a victim's code register their own
  // endpoint and intercept the victim's incoming-call pushes (caller metadata +
  // room code). Resolving code→device via the directory also reaches the right
  // device after an id drift. (addr is already [A-Za-z0-9-]-sanitized.)
  let deviceId = addr;
  const { data: dir } = await admin
    .from("dial_directory")
    .select("device_id")
    .or(`device_id.eq.${addr},dial_code.eq.${addr}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dir?.device_id) deviceId = dir.device_id;

  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("device_id", deviceId)
    // Freshest first, capped — so a flood of junk subs can't push the real
    // (recently-refreshed) subscription out of the send set.
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error || !data || !data.length) return { sent: 0, pruned: 0 };

  const body = JSON.stringify({
    room: payload.room,
    type: payload.type === "audio" ? "audio" : "video",
    fromName: (payload.fromName || "Someone").slice(0, 60),
    fromLang: payload.fromLang || "en",
    fromDevice: payload.fromDevice || "",
    t: Date.now(),
  });

  let sent = 0;
  const deadIds: string[] = [];
  await Promise.allSettled(
    data.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { TTL: 60, urgency: "high" },
        );
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        // 404 Not Found / 410 Gone = subscription permanently dead → prune it.
        if (code === 404 || code === 410) deadIds.push(row.id);
      }
    }),
  );

  let pruned = 0;
  if (deadIds.length) {
    const { error: delErr } = await admin
      .from("push_subscriptions")
      .delete()
      .in("id", deadIds);
    if (!delErr) pruned = deadIds.length;
  }
  return { sent, pruned };
}
