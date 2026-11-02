// ═══════════════════════════════════════════════════════════════════════════════
// SEND RESET CODE (server) — email the 6-digit password-reset OTP via Resend.
//
// Email is the only universal identifier for Entrevoz accounts, so password
// resets go by email. Entrevoz's built-in Supabase mailer is unreliable/
// rate-limited (which is why signup confirmation was bypassed), so we send the
// code ourselves through Resend's HTTP API — no SDK dependency.
//
// Fully env-gated: a no-op until RESEND_API_KEY + RESEND_FROM are set. While
// dormant it logs the code server-side (console.error) so resets are testable
// and support can relay a code manually.
//
// Env:
//   RESEND_API_KEY   Resend API key (re_...)
//   RESEND_FROM      verified sender, e.g. "Entrevoz <noreply@entrevoz.co>"
// ═══════════════════════════════════════════════════════════════════════════════

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim();
const RESEND_FROM = process.env.RESEND_FROM?.trim();

export function resetSenderConfigured(): boolean {
  return !!(RESEND_API_KEY && RESEND_FROM);
}

export interface SendResult {
  sent: boolean;
  channel?: "email";
  reason?: "not_configured" | "send_failed";
}

function buildEmail(code: string, lang: "en" | "es"): {
  subject: string;
  html: string;
  text: string;
} {
  const es = lang === "es";
  const subject = es ? "Tu código de Entrevoz" : "Your Entrevoz reset code";
  const heading = es ? "Restablece tu contraseña" : "Reset your password";
  const lead = es
    ? "Usa este código para restablecer la contraseña de tu cuenta Entrevoz. Vence en 10 minutos."
    : "Use this code to reset your Entrevoz password. It expires in 10 minutes.";
  const ignore = es
    ? "Si no solicitaste esto, puedes ignorar este correo."
    : "If you didn't request this, you can safely ignore this email.";

  const html = `<!doctype html><html><body style="margin:0;background:#030507;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:420px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;margin-bottom:8px;">Entrevoz</div>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px 24px;text-align:center;">
      <div style="color:#ffffff;font-size:17px;font-weight:700;margin-bottom:10px;">${heading}</div>
      <div style="color:rgba(255,255,255,0.6);font-size:13px;line-height:1.5;margin-bottom:22px;">${lead}</div>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#00E5A0;background:rgba(0,229,160,0.08);border-radius:12px;padding:16px 0;">${code}</div>
      <div style="color:rgba(255,255,255,0.35);font-size:12px;line-height:1.5;margin-top:22px;">${ignore}</div>
    </div>
  </div></body></html>`;

  const text = `${heading}\n\n${lead}\n\n${code}\n\n${ignore}`;
  return { subject, html, text };
}

// Send the reset code. WhatsApp OTP can be layered in later once phone numbers
// are captured at signup; for now every account is reachable only by email.
export async function sendResetCode(
  email: string,
  code: string,
  lang: "en" | "es" = "en",
): Promise<SendResult> {
  if (!RESEND_API_KEY || !RESEND_FROM) {
    // Dormant until configured — log so resets are testable + relayable.
    console.error(`[reset] OTP (sender unconfigured) for ${email}: ${code}`);
    return { sent: false, reason: "not_configured" };
  }

  const { subject, html, text } = buildEmail(code, lang);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to: email, subject, html, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[reset] resend", res.status, body.slice(0, 200));
      return { sent: false, reason: "send_failed" };
    }
    return { sent: true, channel: "email" };
  } catch (e) {
    console.error("[reset] send", e);
    return { sent: false, reason: "send_failed" };
  }
}
