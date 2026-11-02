// ═══════════════════════════════════════════════════════════════════════════════
// PASSWORD RESET — REQUEST A CODE
// POST /api/auth/reset/request  { email, lang? }
//
// Generates a 6-digit OTP, stores it hashed (10-min expiry), and emails it.
// ALWAYS returns a generic success so the endpoint can't be used to probe which
// emails have accounts. Rate-limited per IP and per email.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash, randomInt } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendResetCode } from "@/app/lib/send-reset-code";

const schema = z.object({
  email: z.string().email("Invalid email address").max(160),
  lang: z.enum(["en", "es"]).optional(),
});

// sha256(email:code:pepper). The pepper (optional) is defense-in-depth against a
// DB leak; without it a 6-digit code is still protected by expiry + attempt caps
// + rate limiting.
function hashCode(email: string, code: string): string {
  const pepper = process.env.RESET_CODE_PEPPER || "";
  return createHash("sha256")
    .update(`${email.toLowerCase()}:${code}:${pepper}`)
    .digest("hex");
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Neutral response — identical whether or not the email has an account.
  const generic = NextResponse.json({
    data: { ok: true },
    error: null,
    message:
      "If an account exists for that email, we sent a 6-digit code. / Si existe una cuenta, enviamos un código de 6 dígitos.",
  });

  const ipRl = await checkRateLimit(`reset-req-ip:${ip}`, 10, 3600000);
  if (!ipRl.allowed) {
    return NextResponse.json(
      {
        data: null,
        error: "rate_limited",
        message: "Too many requests. Please wait and try again.",
      },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        data: null,
        error: parsed.error.issues[0].message,
        message: "Invalid request",
      },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const lang = parsed.data.lang ?? "en";

  // Per-email cap: 3 codes / 15 min. Exceeded => stop sending, still generic.
  const emailRl = await checkRateLimit(`reset-req-email:${email}`, 3, 900000);
  if (!emailRl.allowed) return generic;

  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      {
        data: null,
        error: "not_configured",
        message: "Password reset is temporarily unavailable.",
      },
      { status: 503 },
    );
  }

  try {
    const { data: userId, error: lookupErr } = await admin.rpc(
      "reset_lookup_user",
      { p_email: email },
    );
    if (lookupErr) {
      console.error("[reset/request] lookup", lookupErr.message);
      return NextResponse.json(
        {
          data: null,
          error: "server_error",
          message: "Could not start reset. Please try again.",
        },
        { status: 500 },
      );
    }
    // No account for that email — return generic, send nothing.
    if (!userId) return generic;

    // Invalidate any outstanding codes for this email before issuing a new one.
    await admin
      .from("password_reset_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("email", email)
      .is("consumed_at", null);

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { error: insErr } = await admin.from("password_reset_codes").insert({
      email,
      user_id: userId,
      code_hash: hashCode(email, code),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      ip,
    });
    if (insErr) {
      console.error("[reset/request] insert", insErr.message);
      return NextResponse.json(
        {
          data: null,
          error: "server_error",
          message: "Could not start reset. Please try again.",
        },
        { status: 500 },
      );
    }

    await sendResetCode(email, code, lang);
    return generic;
  } catch (err) {
    console.error("[reset/request] unexpected", err);
    return NextResponse.json(
      {
        data: null,
        error: "server_error",
        message: "Could not start reset. Please try again.",
      },
      { status: 500 },
    );
  }
}
