import { NextRequest, NextResponse } from "next/server";
import { verifySignedToken } from "@/lib/auth-tokens";

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY TOKEN API - Validate existing session tokens
// Called by client to verify stored tokens are still valid
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { valid: false, error: "Token required" },
        { status: 400 },
      );
    }

    const result = verifySignedToken(token);

    if (result.valid) {
      return NextResponse.json({ valid: true });
    }

    if (result.expired) {
      return NextResponse.json(
        { valid: false, error: "Token expired", expired: true },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { valid: false, error: "Invalid token" },
      { status: 401 },
    );
  } catch {
    return NextResponse.json(
      { valid: false, error: "Server error" },
      { status: 500 },
    );
  }
}
