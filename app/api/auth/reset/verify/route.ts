// ═══════════════════════════════════════════════════════════════════════════════
// PASSWORD RESET — VERIFY CODE + SET NEW PASSWORD
// POST /api/auth/reset/verify  { email, code, password }
//
// Checks the 6-digit code (expiry + max 5 attempts), then sets the new password
// via the GoTrue admin API and consumes the code. Rate-limited per IP.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_ATTEMPTS = 5;

const schema = z.object({
  email: z.string().email("Invalid email address").max(160),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be less than 72 characters"),
});

function hashCode(email: string, code: string): string {
  const pepper = process.env.RESET_CODE_PEPPER || "";
  return createHash("sha256")
    .update(`${email.toLowerCase()}:${code}:${pepper}`)
    .digest("hex");
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const ipRl = await checkRateLimit(`reset-vrf-ip:${ip}`, 30, 3600000);
  if (!ipRl.allowed) {
    return NextResponse.json(
      {
        data: null,
        error: "rate_limited",
        message: "Too many attempts. Please wait and try again.",
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
  const { code, password } = parsed.data;

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

  const invalid = () =>
    NextResponse.json(
      {
        data: null,
        error: "invalid_code",
        message:
          "That code is invalid or expired. Request a new one. / Código inválido o vencido. Solicita uno nuevo.",
      },
      { status: 400 },
    );

  try {
    const { data: rows, error: selErr } = await admin
      .from("password_reset_codes")
      .select("id, user_id, code_hash, expires_at, attempts")
      .eq("email", email)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (selErr) {
      console.error("[reset/verify] select", selErr.message);
      return NextResponse.json(
        { data: null, error: "server_error", message: "Please try again." },
        { status: 500 },
      );
    }

    const row = rows?.[0];
    if (!row) return invalid();

    const consume = () =>
      admin
        .from("password_reset_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", row.id);

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await consume();
      return invalid();
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      await consume();
      return NextResponse.json(
        {
          data: null,
          error: "too_many_attempts",
          message: "Too many attempts. Request a new code.",
        },
        { status: 429 },
      );
    }

    if (hashCode(email, code) !== row.code_hash) {
      const nextAttempts = row.attempts + 1;
      await admin
        .from("password_reset_codes")
        .update({ attempts: nextAttempts })
        .eq("id", row.id);
      const left = MAX_ATTEMPTS - nextAttempts;
      return NextResponse.json(
        {
          data: null,
          error: "bad_code",
          message:
            left > 0
              ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
              : "Too many attempts. Request a new code.",
        },
        { status: 400 },
      );
    }

    // Correct code — set the new password via GoTrue admin, then consume.
    const { error: upErr } = await admin.auth.admin.updateUserById(
      row.user_id,
      { password },
    );
    if (upErr) {
      console.error("[reset/verify] updateUserById", upErr.message);
      return NextResponse.json(
        {
          data: null,
          error: "server_error",
          message: "Could not update password. Please try again.",
        },
        { status: 500 },
      );
    }

    await consume();

    return NextResponse.json({
      data: { ok: true, email },
      error: null,
      message: "Password updated. You can sign in now.",
    });
  } catch (err) {
    console.error("[reset/verify] unexpected", err);
    return NextResponse.json(
      { data: null, error: "server_error", message: "Please try again." },
      { status: 500 },
    );
  }
}
