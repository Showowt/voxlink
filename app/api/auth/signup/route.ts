// ═══════════════════════════════════════════════════════════════════════════════
// AUTH SIGNUP API - Email/Password Registration (instant, no email confirmation)
// POST /api/auth/signup
//
// Accounts are OPTIONAL in Entrevoz (core translation works without one), so we
// don't gate sign-up behind email delivery — Supabase's built-in mailer is
// rate-limited and unreliable, which left users stuck on "check your email".
// Instead we create the account already-confirmed via the admin API and let the
// client sign in immediately. Every signup is logged to usage_events for
// tracking. The on_auth_user_created trigger still fires, so the profile +
// subscription rows are created exactly as with a normal signup.
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// ── Rate limiting (per-IP, in-memory best-effort) ──────────────────────────────
const limiter = new Map<string, { count: number; reset: number }>();
function checkLimit(ip: string, max: number): boolean {
  const now = Date.now();
  const e = limiter.get(ip);
  if (!e || now > e.reset) {
    limiter.set(ip, { count: 1, reset: now + 60000 });
    return true;
  }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

const signupSchema = z.object({
  email: z.string().email("Invalid email address").max(160),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be less than 72 characters"),
  name: z.string().min(1).max(100).optional(),
});

// Service-role client — server-only. Never expose this key to the browser.
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/\\n/g, "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkLimit(ip, 10)) {
    return NextResponse.json(
      { data: null, error: "Rate limited", message: "Too many attempts. Please wait a minute." },
      { status: 429 },
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const validation = signupSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { data: null, error: validation.error.issues[0].message, message: "Validation failed" },
        { status: 400 },
      );
    }
    const { email, password, name } = validation.data;
    const displayName = name || email.split("@")[0];

    const admin = adminClient();
    if (!admin) {
      return NextResponse.json(
        { data: null, error: "Authentication not configured", message: "Sign-up is temporarily unavailable." },
        { status: 503 },
      );
    }

    // Create the account ALREADY confirmed (no email step). The
    // on_auth_user_created trigger creates the profile + subscription.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // Send both keys: the DB trigger derives the profile display name from
      // full_name; `name` is kept for parity with the client metadata shape.
      user_metadata: { name: displayName, full_name: displayName },
    });

    if (error) {
      const msg = (error.message || "").toLowerCase();
      // Supabase returns 422 / "already been registered" for a duplicate email.
      if (error.status === 422 || msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return NextResponse.json(
          { data: null, error: "Email already in use", message: "An account with this email already exists. Please sign in instead." },
          { status: 409 },
        );
      }
      console.error("[Auth Signup] createUser failed:", error.message);
      return NextResponse.json(
        { data: null, error: error.message, message: "Failed to create account" },
        { status: 400 },
      );
    }

    const userId = data.user?.id ?? null;

    // Track the signup (never block account creation on a logging failure).
    if (userId) {
      const { error: logErr } = await admin.from("usage_events").insert({
        user_id: userId,
        event_type: "signup",
        metadata: {
          method: "email",
          name: displayName,
          ip,
          country: request.headers.get("x-vercel-ip-country") ?? null,
        },
      });
      if (logErr) console.error("[Auth Signup] usage_events log failed:", logErr.message);
    }

    return NextResponse.json(
      {
        data: {
          user: userId ? { id: userId, email: data.user?.email, name: displayName } : null,
          needsConfirmation: false,
        },
        error: null,
        message: "Account created successfully",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[Auth Signup] Unexpected error:", err);
    return NextResponse.json(
      { data: null, error: "Internal server error", message: "An unexpected error occurred. Please try again." },
      { status: 500 },
    );
  }
}
