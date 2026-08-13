import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

// ═══════════════════════════════════════════════════════════════════════════════
// TURN CREDENTIALS API - Server-side ICE server configuration
// Keeps TURN credentials secure (not exposed in client JS)
// Rate limited to prevent credential enumeration attacks (uses Upstash Redis)
//
// COLOMBIA-HARDENED (2026):
//   - Multi-domain Metered lookup (handles voxlink → entrevoz rebrand)
//   - TCP + TLS transport variants (Colombian firewalls block UDP 3478)
//   - Twilio TURN fallback (excellent SA/Miami nodes for Colombia)
//   - Static env TURN fallback (TURN_SERVER/TURN_USERNAME/TURN_CREDENTIAL)
//     NOTE: openrelay.metered.ca free relay is DEAD as of June 2026 — removed.
//     Symmetric NAT (all Colombian carriers) needs a working relay, so keep
//     METERED_API_KEY or Twilio or the static TURN_* env vars configured.
//   - 5-minute in-memory cache to avoid re-hitting providers every call
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

// Rate limiting configuration
const RATE_LIMIT = 20; // requests per window (raised — relay escalation may re-fetch)
const RATE_WINDOW = 60000; // 1 minute in ms

// ─── Cache TURN credentials (valid 5 min) ──────────────────────────────────────
let credentialCache: { servers: RTCIceServer[]; meta: TurnMeta; expiresAt: number } | null =
  null;

interface TurnMeta {
  turnCount: number;
  provider: string;
  fallback: boolean;
}

// ─── Always-available STUN (public, free) ──────────────────────────────────────
const EMERGENCY_STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
  { urls: "stun:stun.cloudflare.com:3478" }, // excellent LatAm coverage
];

interface MeteredServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

async function getMeteredTurn(): Promise<RTCIceServer[] | null> {
  const apiKey = process.env.METERED_API_KEY;
  if (!apiKey) return null;

  // Try multiple Metered domain variations (handles rebrand + account naming)
  const domains = [
    process.env.METERED_DOMAIN, // explicit override
    "entrevoz.metered.live", // new branding
    "machinemind.metered.live", // prior default
    "voxlink.metered.live", // old branding
  ].filter(Boolean) as string[];

  for (const domain of domains) {
    try {
      const res = await fetch(
        `https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`,
        { signal: AbortSignal.timeout(4000) },
      );
      if (!res.ok) continue;

      const servers = (await res.json()) as MeteredServer[];
      if (!Array.isArray(servers) || servers.length === 0) continue;

      // Must contain at least one TURN server (not just STUN)
      const hasTurn = servers.some((s) => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
        return urls.some(
          (u) => u?.startsWith("turn:") || u?.startsWith("turns:"),
        );
      });
      if (!hasTurn) continue;

      console.log(`[TURN] Metered from ${domain}: ${servers.length} servers`);

      // Enrich every TURN url with a TCP variant (Colombian firewall bypass)
      const enriched: RTCIceServer[] = servers.map((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        const set = new Set<string>(urls);
        urls.forEach((url) => {
          if (url?.startsWith("turn:") && !url.includes("transport=tcp")) {
            set.add(url + "?transport=tcp");
          }
        });
        return {
          urls: Array.from(set),
          username: server.username,
          credential: server.credential,
        };
      });

      return enriched;
    } catch (e) {
      console.warn(`[TURN] Metered ${domain} failed:`, e);
      continue;
    }
  }
  return null;
}

async function getTwilioTurn(): Promise<RTCIceServer[] | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Tokens.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "Ttl=86400",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      ice_servers: Array<{
        url?: string;
        urls?: string;
        username?: string;
        credential?: string;
      }>;
    };

    return data.ice_servers
      .map((s) => ({
        urls: [s.urls ?? s.url ?? ""].filter(Boolean),
        ...(s.username && { username: s.username }),
        ...(s.credential && { credential: s.credential }),
      }))
      .filter((s) => s.urls.length > 0);
  } catch (e) {
    console.warn("[TURN] Twilio failed:", e);
    return null;
  }
}

// Static TURN from env vars — reliable fallback that replaces dead openrelay.
// Set TURN_SERVER (host, no scheme), TURN_USERNAME, TURN_CREDENTIAL in Vercel.
function getStaticEnvTurn(): RTCIceServer[] | null {
  const server = process.env.TURN_SERVER;
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;
  if (!server || !username || !credential) return null;

  return [
    {
      urls: [
        `turn:${server}:443`,
        `turn:${server}:443?transport=tcp`,
        `turns:${server}:443?transport=tcp`,
      ],
      username,
      credential,
    },
  ];
}

export async function GET(request: NextRequest) {
  // Extract IP for rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const rateLimit = await checkRateLimit(`turn:${ip}`, RATE_LIMIT, RATE_WINDOW);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  // Serve from cache if fresh (credentials are shared, not per-user)
  if (credentialCache && Date.now() < credentialCache.expiresAt) {
    return NextResponse.json(
      {
        iceServers: credentialCache.servers,
        ttl: 86400,
        provider: credentialCache.meta.provider,
        meta: credentialCache.meta,
        timestamp: Date.now(),
      },
      {
        headers: {
          ...rateLimitHeaders(rateLimit),
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  }

  // Try paid providers in parallel (faster than sequential)
  const [metered, twilio] = await Promise.allSettled([
    getMeteredTurn(),
    getTwilioTurn(),
  ]);

  let turnServers: RTCIceServer[] = [];
  let provider = "stun-only";
  let fallback = true;

  if (metered.status === "fulfilled" && metered.value) {
    turnServers = metered.value;
    provider = "metered";
    fallback = false;
  } else if (twilio.status === "fulfilled" && twilio.value) {
    turnServers = twilio.value;
    provider = "twilio";
    fallback = false;
    console.log("[TURN] Using Twilio (Metered unavailable)");
  } else {
    // Both paid providers failed — try static env TURN (openrelay is dead)
    const staticTurn = getStaticEnvTurn();
    if (staticTurn) {
      turnServers = staticTurn;
      provider = "static";
      console.warn("[TURN] Using static env TURN fallback");
    } else {
      console.error(
        "[TURN] No TURN servers available! Set METERED_API_KEY, Twilio, or " +
          "TURN_SERVER/TURN_USERNAME/TURN_CREDENTIAL. Calls behind symmetric " +
          "NAT (most Colombian mobile networks) WILL fail without a relay.",
      );
    }
  }

  // When a paid provider is up, add static env TURN too (redundant relay path
  // costs nothing and survives a provider silently rate-limiting mid-session).
  if (provider !== "static") {
    const staticTurn = getStaticEnvTurn();
    if (staticTurn) turnServers = [...turnServers, ...staticTurn];
  }

  const iceServers: RTCIceServer[] = [...EMERGENCY_STUN, ...turnServers];

  const meta: TurnMeta = {
    turnCount: turnServers.length,
    provider,
    fallback,
  };

  // Cache for 5 minutes
  credentialCache = { servers: iceServers, meta, expiresAt: Date.now() + 5 * 60 * 1000 };

  console.log(
    `[TURN] Returning ${iceServers.length} servers (provider: ${provider}, fallback: ${fallback})`,
  );

  return NextResponse.json(
    { iceServers, ttl: 86400, provider, meta, timestamp: Date.now() },
    {
      headers: {
        ...rateLimitHeaders(rateLimit),
        "Cache-Control": "private, max-age=300",
      },
    },
  );
}
