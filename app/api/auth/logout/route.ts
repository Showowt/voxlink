// ═══════════════════════════════════════════════════════════════════════════════
// AUTH LOGOUT API - Sign out and clear session
// POST /api/auth/logout
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-auth";

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// POST - Sign out the current user
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip, 30)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    // Create Supabase client
    const supabase = await createServerClient();

    if (!supabase) {
      return NextResponse.json(
        {
          data: null,
          error: "Authentication not configured",
          message: "Supabase is not configured.",
        },
        { status: 503 },
      );
    }

    // Sign out the user
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("[Auth Logout]", error);

      return NextResponse.json(
        {
          data: null,
          error: error.message,
          message: "Failed to sign out",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        data: null,
        error: null,
        message: "Signed out successfully",
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[Auth Logout] Unexpected error:", err);

    return NextResponse.json(
      {
        data: null,
        error: "Internal server error",
        message: "An unexpected error occurred.",
      },
      { status: 500 },
    );
  }
}
