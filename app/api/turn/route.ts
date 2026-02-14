import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════════════
// TURN SERVER CREDENTIALS API
// Provides ICE servers for WebRTC connections
// Uses multiple reliable STUN servers + Metered.ca free TURN
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

// Metered.ca TURN - credentials from environment
const METERED_API_KEY = process.env.METERED_API_KEY || "";
const TURN_USERNAME = process.env.TURN_USERNAME || "";
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || "";

export async function GET() {
  // Base ICE servers - reliable Google STUN
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // Additional public STUN servers
    { urls: "stun:stun.stunprotocol.org:3478" },
    { urls: "stun:stun.voip.blackberry.com:3478" },
  ];

  // Try to get Metered.ca TURN credentials if API key is set
  if (METERED_API_KEY) {
    try {
      const response = await fetch(
        `https://voxlink.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`,
        { next: { revalidate: 3600 } }, // Cache for 1 hour
      );

      if (response.ok) {
        const turnServers = await response.json();
        iceServers.push(...turnServers);
      }
    } catch (err) {
      console.error("Failed to fetch Metered TURN credentials:", err);
    }
  }

  // Add TURN servers only if credentials are configured via environment
  if (TURN_USERNAME && TURN_CREDENTIAL) {
    iceServers.push(
      {
        urls: "turn:global.relay.metered.ca:80",
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL,
      },
    );
  }

  return NextResponse.json({ iceServers });
}
