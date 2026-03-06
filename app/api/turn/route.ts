import { NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════════════
// TURN CREDENTIALS API - Server-side ICE server configuration
// Keeps TURN credentials secure (not exposed in client JS)
// ═══════════════════════════════════════════════════════════════════════════════

// TURN credentials from environment (set in Vercel dashboard)
const TURN_USERNAME = process.env.TURN_USERNAME || "openrelayproject";
const TURN_CREDENTIAL = process.env.TURN_CREDENTIAL || "openrelayproject";

export async function GET() {
  // Return ICE servers with TURN credentials
  const iceServers: RTCIceServer[] = [
    // Google STUN - public, no credentials needed
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },

    // Twilio STUN - public
    { urls: "stun:global.stun.twilio.com:3478" },

    // TURN servers - credentials from env
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

    // OpenRelay backup (public credentials)
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  return NextResponse.json({ iceServers });
}
