import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// ═══════════════════════════════════════════════════════════════════════════════
// TURN CREDENTIALS API - Server-side ICE server configuration
// Keeps TURN credentials secure (not exposed in client JS)
// Rate limited to prevent credential enumeration attacks (uses Upstash Redis)
// ═══════════════════════════════════════════════════════════════════════════════

// Rate limiting configuration
const RATE_LIMIT = 10; // requests per window
const RATE_WINDOW = 60000; // 1 minute in ms

export async function GET(request: NextRequest) {
  // Extract IP for rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // Check rate limit (uses Upstash Redis in production)
  const rateLimit = await checkRateLimit(`turn:${ip}`, RATE_LIMIT, RATE_WINDOW);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: rateLimitHeaders(rateLimit),
      },
    );
  }

  // Read TURN credentials at runtime
  const TURN_USERNAME = process.env.TURN_USERNAME;
  const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL;

  // Base ICE servers with STUN (always available)
  const iceServers: RTCIceServer[] = [
    // Google STUN - public, no credentials needed
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },

    // Twilio STUN - public
    { urls: "stun:global.stun.twilio.com:3478" },
  ];

  // Add TURN servers only if credentials are configured
  if (TURN_USERNAME && TURN_CREDENTIAL) {
    iceServers.push(
      {
        urls: "turn:a.relay.metered.ca:80",
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      },
      {
        urls: "turn:a.relay.metered.ca:443",
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      },
      {
        urls: "turn:a.relay.metered.ca:443?transport=tcp",
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      },
      // TURNS (TLS) for maximum compatibility
      {
        urls: "turns:a.relay.metered.ca:443?transport=tcp",
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      },
    );
  } else {
    // Fallback to public OpenRelay (less reliable but always works)
    console.warn(
      "[Voxxo] TURN credentials not configured - using public relay",
    );
    iceServers.push({
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }

  return NextResponse.json(
    {
      iceServers,
      ttl: 86400, // 24 hours
      provider: TURN_USERNAME ? "metered" : "openrelay",
      timestamp: Date.now(),
    },
    {
      headers: {
        ...rateLimitHeaders(rateLimit),
        "Cache-Control": "private, max-age=3600",
      },
    },
  );
}
