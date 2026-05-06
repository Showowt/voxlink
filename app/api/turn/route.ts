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
      const res = await fetch(meteredUrl, { next: { revalidate: 3600 } });

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

  // Fallback to public OpenRelay if Metered didn't provide TURN servers
  if (provider !== "metered") {
    console.warn("[TURN] Using public OpenRelay fallback");
    iceServers.push(
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    );
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
