import { NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFY CODE API - VoxLink Access Gate
// Validates 4-digit access code and returns session token
// Security: Rate limiting + timing-safe comparison
// ═══════════════════════════════════════════════════════════════════════════════

// Rate limiting configuration
const MAX_ATTEMPTS = 5; // Max attempts per window
const WINDOW_MS = 60 * 1000; // 1 minute window
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minute lockout after max failures

// In-memory rate limit store (resets on deploy)
const rateLimits = new Map<
  string,
  { attempts: number; windowStart: number; lockedUntil: number }
>();

// Clean up old entries every 10 minutes
setInterval(
  () => {
    const now = Date.now();
    const entries = Array.from(rateLimits.entries());
    for (const [ip, data] of entries) {
      if (now - data.windowStart > LOCKOUT_MS + WINDOW_MS) {
        rateLimits.delete(ip);
      }
    }
  },
  10 * 60 * 1000,
);

// Timing-safe string comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    const dummy = Buffer.from(a);
    timingSafeEqual(dummy, dummy);
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Get client IP from request
function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "unknown";
}

export async function POST(request: Request) {
  const clientIP = getClientIP(request);
  const now = Date.now();

  // Get or create rate limit entry
  let rateLimit = rateLimits.get(clientIP);
  if (!rateLimit) {
    rateLimit = { attempts: 0, windowStart: now, lockedUntil: 0 };
    rateLimits.set(clientIP, rateLimit);
  }

  // Check if locked out
  if (rateLimit.lockedUntil > now) {
    const retryAfter = Math.ceil((rateLimit.lockedUntil - now) / 1000);
    return NextResponse.json(
      {
        valid: false,
        error: `Too many attempts. Try again in ${retryAfter} seconds.`,
        retryAfter,
      },
      {
        status: 429,
        headers: { "Retry-After": retryAfter.toString() },
      },
    );
  }

  // Reset window if expired
  if (now - rateLimit.windowStart > WINDOW_MS) {
    rateLimit.attempts = 0;
    rateLimit.windowStart = now;
  }

  // Check if over limit
  if (rateLimit.attempts >= MAX_ATTEMPTS) {
    // Lock out for 5 minutes
    rateLimit.lockedUntil = now + LOCKOUT_MS;
    const retryAfter = Math.ceil(LOCKOUT_MS / 1000);
    return NextResponse.json(
      {
        valid: false,
        error: `Too many failed attempts. Locked for ${Math.ceil(LOCKOUT_MS / 60000)} minutes.`,
        retryAfter,
      },
      {
        status: 429,
        headers: { "Retry-After": retryAfter.toString() },
      },
    );
  }

  try {
    // Read env var at runtime (not build time)
    const ACCESS_CODE = process.env.VOXLINK_ACCESS_CODE;

    const { code } = await request.json();

    // Validate input
    if (!code || typeof code !== "string" || code.length !== 4) {
      return NextResponse.json(
        { valid: false, error: "Invalid code format" },
        { status: 400 },
      );
    }

    // Fail if ACCESS_CODE not configured
    if (!ACCESS_CODE) {
      console.error(
        "CRITICAL: VOXLINK_ACCESS_CODE environment variable not set",
      );
      return NextResponse.json(
        { valid: false, error: "Service not configured" },
        { status: 503 },
      );
    }

    // Timing-safe code comparison
    if (secureCompare(code, ACCESS_CODE)) {
      // Success - reset rate limit
      rateLimit.attempts = 0;
      rateLimit.lockedUntil = 0;

      // Generate secure session token
      const token = randomBytes(32).toString("hex");

      return NextResponse.json({
        valid: true,
        token,
      });
    }

    // Failed attempt - increment counter
    rateLimit.attempts++;
    const attemptsRemaining = MAX_ATTEMPTS - rateLimit.attempts;

    return NextResponse.json(
      {
        valid: false,
        error:
          attemptsRemaining > 0
            ? `Incorrect code. ${attemptsRemaining} attempts remaining.`
            : "Incorrect code.",
      },
      { status: 401 },
    );
  } catch {
    return NextResponse.json(
      { valid: false, error: "Server error" },
      { status: 500 },
    );
  }
}
