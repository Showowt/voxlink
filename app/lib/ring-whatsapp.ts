// ═══════════════════════════════════════════════════════════════════════════════
// RING → WHATSAPP (server orchestration). Called from /api/ring/send on the FIRST
// ring (fresh-insert branch). Fires a WhatsApp/SMS "tap to answer" ONLY when:
//   1. WhatsApp/SMS is configured (Twilio env set),
//   2. the CALLER is premium (the monetized feature),
//   3. the callee has a saved phone number,
//   4. the callee is NOT already in the app (no foreground beacon in the last
//      60s — don't text someone who's looking at the ring), and
//   5. we haven't already texted this callee in the last 2 minutes (anti-spam).
// Best-effort; never throws into the ring path.
// ═══════════════════════════════════════════════════════════════════════════════

import { whatsappConfigured, sendCallPing } from "@/app/lib/whatsapp";

export interface RingWhatsAppInput {
  toAddress: string; // device id OR dial code the caller dialed
  room: string;
  type: "video" | "audio";
  fromDevice: string;
  fromName?: string | null;
  fromLang?: string | null;
}

// toAddress is interpolated into a PostgREST .or() filter → allow only safe chars.
function safeAddr(a: string): string | null {
  const s = (a || "").trim().slice(0, 64);
  return s && /^[A-Za-z0-9-]+$/.test(s) ? s : null;
}

export async function maybeSendCallWhatsApp(opts: RingWhatsAppInput): Promise<{
  sent: boolean;
  reason?: string;
}> {
  if (!whatsappConfigured()) return { sent: false, reason: "not_configured" };
  const addr = safeAddr(opts.toAddress);
  if (!addr) return { sent: false, reason: "bad_address" };

  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const admin = supabaseAdmin();
  if (!admin) return { sent: false, reason: "no_db" };

  // 1. Caller must be premium (the monetized feature).
  const { getEntitlement } = await import("@/lib/entitlement");
  const ent = await getEntitlement({ deviceId: opts.fromDevice });
  if (!ent.entitled) return { sent: false, reason: "caller_not_premium" };

  // 2. Resolve the dialed address to the callee's CURRENT device id, then phone.
  let deviceId = addr;
  const { data: dir } = await admin
    .from("dial_directory")
    .select("device_id")
    .or(`device_id.eq.${addr},dial_code.eq.${addr}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dir?.device_id) deviceId = dir.device_id;

  const { data: ph } = await admin
    .from("user_phones")
    .select("phone")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (!ph?.phone) return { sent: false, reason: "no_phone" };

  // 3. Skip if the callee is already in the app (foregrounded in the last 60s).
  const since = new Date(Date.now() - 60000).toISOString();
  const { data: recent } = await admin
    .from("diag_events")
    .select("id")
    .eq("device_id", deviceId)
    .in("step", ["foreground", "app-load"])
    .gte("created_at", since)
    .limit(1);
  if (recent && recent.length) return { sent: false, reason: "callee_in_app" };

  // 4. Anti-spam: at most one ping per callee phone per 2 minutes.
  const { checkRateLimit } = await import("@/lib/rate-limit");
  const rl = await checkRateLimit(`waping:${ph.phone}`, 1, 120000);
  if (!rl.allowed) return { sent: false, reason: "rate_limited" };

  // 5. Build the join link + send.
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.entrevoz.co")
    .trim()
    .replace(/\/+$/, "");
  const path = opts.type === "audio" ? "talk" : "call";
  const q = new URLSearchParams({ host: "false" });
  if (opts.fromLang) q.set("hostLang", opts.fromLang);
  if (opts.fromDevice) q.set("pd", opts.fromDevice);
  if (opts.fromName) q.set("pn", opts.fromName);
  const link = `${base}/${path}/${opts.room}?${q.toString()}`;

  const res = await sendCallPing(ph.phone, {
    fromName: opts.fromName || "Someone",
    link,
    type: opts.type,
  });
  return res.sent ? { sent: true } : { sent: false, reason: res.reason };
}
