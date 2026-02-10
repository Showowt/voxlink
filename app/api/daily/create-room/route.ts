import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Daily.co API - Get your key at https://dashboard.daily.co/developers
const DAILY_API_KEY = process.env.DAILY_API_KEY || ''
const DAILY_API_URL = 'https://api.daily.co/v1'

// Rate limiting
const roomCreations = new Map<string, number>()
const MAX_ROOMS_PER_HOUR = 10

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const hourAgo = now - 3600000

  // Clean old entries
  for (const [key, time] of roomCreations.entries()) {
    if (time < hourAgo) roomCreations.delete(key)
  }

  const count = Array.from(roomCreations.entries())
    .filter(([key]) => key.startsWith(ip))
    .length

  if (count >= MAX_ROOMS_PER_HOUR) return false

  roomCreations.set(`${ip}-${now}`, now)
  return true
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 10 rooms per hour.' },
      { status: 429 }
    )
  }

  if (!DAILY_API_KEY) {
    // Demo mode - return a test room URL for development
    const roomName = `voxlink-${Date.now().toString(36)}`
    return NextResponse.json({
      name: roomName,
      url: `https://voxlink.daily.co/${roomName}`,
      demo: true,
      message: 'Demo mode - set DAILY_API_KEY for production'
    })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const roomName = body.roomName || `voxlink-${Date.now().toString(36)}`

    // Create room with Daily.co API
    const response = await fetch(`${DAILY_API_URL}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'public',
        properties: {
          max_participants: 2,
          enable_chat: false,
          enable_knocking: false,
          enable_screenshare: false,
          enable_recording: false,
          exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
          eject_at_room_exp: true,
          lang: 'en'
        }
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Daily.co API error:', error)

      // If room already exists, return it
      if (error.info?.includes('already exists')) {
        return NextResponse.json({
          name: roomName,
          url: `https://${process.env.DAILY_DOMAIN || 'voxlink'}.daily.co/${roomName}`,
          existing: true
        })
      }

      return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
    }

    const room = await response.json()

    return NextResponse.json({
      name: room.name,
      url: room.url,
      created: true
    })
  } catch (error) {
    console.error('Room creation error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// Get room info
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roomName = searchParams.get('room')

  if (!roomName) {
    return NextResponse.json({ error: 'Room name required' }, { status: 400 })
  }

  if (!DAILY_API_KEY) {
    return NextResponse.json({
      name: roomName,
      url: `https://voxlink.daily.co/${roomName}`,
      demo: true
    })
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`
      }
    })

    if (!response.ok) {
      return NextResponse.json({ exists: false })
    }

    const room = await response.json()
    return NextResponse.json({
      name: room.name,
      url: room.url,
      exists: true
    })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
