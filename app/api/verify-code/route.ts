import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Access code from environment - NO DEFAULT (must be set in Vercel)
const ACCESS_CODE = process.env.VOXLINK_ACCESS_CODE;
if (!ACCESS_CODE) {
  console.error("CRITICAL: VOXLINK_ACCESS_CODE environment variable not set");
}

// Rate limiting: max 5 attempts per IP per minute
const attempts = new Map<string, { count: number; resetAt: number }>();

function getRateLimitKey(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + 60000 });
    return { allowed: true, remaining: 4 };
  }

  if (record.count >= 5) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: 5 - record.count };
}

// Clean up old entries on each request (lightweight)
function cleanAttempts() {
  const now = Date.now();
  Array.from(attempts.entries()).forEach(([key, record]) => {
    if (now > record.resetAt) {
      attempts.delete(key);
    }
  });
}

export async function POST(req: NextRequest) {
  // Clean old attempts
  cleanAttempts();

  const ip = getRateLimitKey(req);
  const rateLimit = checkRateLimit(ip);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { valid: false, error: "Too many attempts. Try again in 1 minute." },
      { status: 429 },
    );
  }

  try {
    // Fail if ACCESS_CODE not configured
    if (!ACCESS_CODE) {
      console.error("ACCESS_CODE not configured");
      return NextResponse.json(
        { valid: false, error: "Server misconfigured" },
        { status: 500 },
      );
    }

    const { code } = await req.json();

    if (!code || typeof code !== "string" || code.length !== 4) {
      return NextResponse.json({ valid: false, error: "Invalid code format" });
    }

    // Constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(code.padEnd(4, "0")),
      Buffer.from(ACCESS_CODE.padEnd(4, "0")),
    );

    if (isValid) {
      // Generate a session token
      const token = crypto.randomBytes(32).toString("hex");
      return NextResponse.json({ valid: true, token });
    }

    return NextResponse.json({
      valid: false,
      error: "Invalid code",
      remaining: rateLimit.remaining,
    });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Server error" },
      { status: 500 },
    );
  }
}
