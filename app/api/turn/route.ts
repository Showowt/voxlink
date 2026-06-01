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

  // Metered TURN credentials via REST API
  const METERED_API_KEY = process.env.METERED_API_KEY;
  const METERED_DOMAIN =
    process.env.METERED_DOMAIN ?? "machinemind.metered.live";

  // Base ICE servers with STUN (always available)
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ];

  let provider = "stun-only";

  if (METERED_API_KEY) {
    try {
      const meteredUrl = `https://${METERED_DOMAIN}/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`;
      const res = await fetch(meteredUrl, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });

      if (res.ok) {
        const turnServers = (await res.json()) as RTCIceServer[];
        iceServers.push(...turnServers);
        provider = "metered";
      } else {
        console.warn(
          `[TURN] Metered API returned ${res.status} — falling back to public relay`,
        );
      }
    } catch (err) {
      console.warn("[TURN] Metered API fetch failed:", err);
    }
  }

  // Fallback TURN servers when Metered is not configured
  // OpenRelay (openrelay.metered.ca) is DEAD as of June 2026 — removed.
  // Use env-based static TURN credentials as fallback.
  if (provider !== "metered") {
    const turnUsername = process.env.TURN_USERNAME;
    const turnCredential = process.env.TURN_CREDENTIAL;
    const turnServer = process.env.TURN_SERVER;

    if (turnUsername && turnCredential && turnServer) {
      console.warn("[TURN] Using static TURN credentials fallback");
      iceServers.push(
        {
          urls: `turn:${turnServer}:443`,
          username: turnUsername,
          credential: turnCredential,
        },
        {
          urls: `turn:${turnServer}:443?transport=tcp`,
          username: turnUsername,
          credential: turnCredential,
        },
      );
      provider = "static";
    } else {
      console.error(
        "[TURN] No TURN servers available! Set METERED_API_KEY or TURN_USERNAME/TURN_CREDENTIAL/TURN_SERVER. " +
        "Calls behind symmetric NATs (most mobile networks) WILL fail.",
      );
    }
  }

  return NextResponse.json(
    {
      iceServers,
      ttl: 86400,
      provider,
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
