import { NextRequest, NextResponse } from "next/server";
import { verifySignedToken } from "@/lib/auth-tokens";

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY TOKEN API - Validate existing session tokens
// Called by client to verify stored tokens are still valid
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

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip, 30)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

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
