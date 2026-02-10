import { NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════════════════════════
// TURN SERVER CREDENTIALS API
// Provides ICE servers for WebRTC connections
// Uses multiple reliable STUN servers + Metered.ca free TURN
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

// Metered.ca free TURN - sign up at metered.ca for API key
// For now, use their relay servers with open credentials
const METERED_API_KEY = process.env.METERED_API_KEY || ''

export async function GET() {
  // Base ICE servers - reliable Google STUN
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Additional public STUN servers
    { urls: 'stun:stun.stunprotocol.org:3478' },
    { urls: 'stun:stun.voip.blackberry.com:3478' },
  ]

  // Try to get Metered.ca TURN credentials if API key is set
  if (METERED_API_KEY) {
    try {
      const response = await fetch(
        `https://voxlink.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`,
        { next: { revalidate: 3600 } } // Cache for 1 hour
      )

      if (response.ok) {
        const turnServers = await response.json()
        iceServers.push(...turnServers)
      }
    } catch (err) {
      console.error('Failed to fetch Metered TURN credentials:', err)
    }
  }

  // Fallback: Add Twilio's free TURN servers (limited but reliable)
  // These are public test servers that work for small-scale use
  iceServers.push(
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'e8dd65b92c62d5e84cb3c1e1',
      credential: 'uWdWNmkhvyqTEuGR',
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: 'e8dd65b92c62d5e84cb3c1e1',
      credential: 'uWdWNmkhvyqTEuGR',
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'e8dd65b92c62d5e84cb3c1e1',
      credential: 'uWdWNmkhvyqTEuGR',
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: 'e8dd65b92c62d5e84cb3c1e1',
      credential: 'uWdWNmkhvyqTEuGR',
    }
  )

  return NextResponse.json({ iceServers })
}
