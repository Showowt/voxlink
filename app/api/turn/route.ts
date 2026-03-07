import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════════════
// TURN CREDENTIALS API - Server-side ICE server configuration
// Keeps TURN credentials secure (not exposed in client JS)
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET() {
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
    );
  } else {
    // Fallback to public OpenRelay (less reliable but always works)
    console.warn("TURN credentials not configured - using public relay");
    iceServers.push({
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }

  return NextResponse.json({ iceServers });
}
