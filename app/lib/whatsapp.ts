// ═══════════════════════════════════════════════════════════════════════════════
// WHATSAPP / SMS (server) — "tap to answer" out-of-band wake via Twilio.
//
// When a PREMIUM caller rings someone whose app is closed (no in-app ring, no
// push), we text them a join link so they can answer with zero setup on their
// end. WhatsApp first (universal in LatAm), SMS fallback. Fully env-gated — a
// no-op until the Twilio vars are set, so it ships safely.
//
// Env:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN            (required)
//   TWILIO_WHATSAPP_FROM        e.g. "whatsapp:+14155238886"  (WhatsApp sender)
//   TWILIO_WHATSAPP_CONTENT_SID approved template ContentSid  (business-initiated
//                               outside the 24h window REQUIRES this; without it
//                               we send freeform Body — only valid in the sandbox
//                               or inside an open 24h window)
//   TWILIO_SMS_FROM             e.g. "+14155551234"           (SMS fallback sender)
// ═══════════════════════════════════════════════════════════════════════════════

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const KEY_SID = process.env.TWILIO_API_KEY_SID;
const KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;
const WA_FROM = process.env.TWILIO_WHATSAPP_FROM;
const WA_CONTENT_SID = process.env.TWILIO_WHATSAPP_CONTENT_SID;
const SMS_FROM = process.env.TWILIO_SMS_FROM;

// Prefer a scoped, revocable API Key (SK… + secret) over the master Auth Token.
// The Account SID is still used in the request path either way.
const AUTH_USER = KEY_SID || SID;
const AUTH_PASS = KEY_SECRET || TOKEN;

export function whatsappConfigured(): boolean {
  return !!(SID && AUTH_USER && AUTH_PASS && (WA_FROM || SMS_FROM));
}

async function twilioSend(params: URLSearchParams): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[whatsapp] twilio", res.status, t.slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[whatsapp] send", e);
    return false;
  }
}

export interface CallPing {
  fromName: string;
  link: string;
  type: "video" | "audio";
}

// Send a "tap to answer" message. WhatsApp first, SMS fallback.
export async function sendCallPing(
  toPhone: string,
  ping: CallPing,
): Promise<{ sent: boolean; channel?: "whatsapp" | "sms"; reason?: string }> {
  if (!SID || !AUTH_USER || !AUTH_PASS) return { sent: false, reason: "not_configured" };
  const name = (ping.fromName || "Someone").slice(0, 60);

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  if (WA_FROM) {
    const p = new URLSearchParams();
    p.set("From", WA_FROM);
    p.set("To", `whatsapp:${toPhone}`);
    if (WA_CONTENT_SID) {
      // Approved template: {{1}} = caller name, {{2}} = join link.
      p.set("ContentSid", WA_CONTENT_SID);
      p.set("ContentVariables", JSON.stringify({ "1": name, "2": ping.link }));
    } else {
      p.set(
        "Body",
        `📞 ${name} is calling you on Entrevoz — tap to answer: ${ping.link}`,
      );
    }
    if (await twilioSend(p)) return { sent: true, channel: "whatsapp" };
  }

  // ── SMS fallback ──────────────────────────────────────────────────────────
  if (SMS_FROM) {
    const p = new URLSearchParams();
    p.set("From", SMS_FROM);
    p.set("To", toPhone);
    p.set("Body", `Entrevoz: ${name} is calling you — tap to answer: ${ping.link}`);
    if (await twilioSend(p)) return { sent: true, channel: "sms" };
  }

  return { sent: false, reason: "send_failed" };
}
