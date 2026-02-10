import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════════════════════════
// DAILY.CO ROOM CREATION API
// Creates video rooms with enterprise-grade infrastructure
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

const DAILY_API_KEY = process.env.DAILY_API_KEY || ''
const DAILY_API_URL = 'https://api.daily.co/v1'

// Rate limiting
const roomCreations = new Map<string, number>()
const MAX_ROOMS_PER_HOUR = 20

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const hourAgo = now - 3600000

  // Clean old entries
  const entries = Array.from(roomCreations.entries())
  for (const [key, time] of entries) {
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
      { error: 'Rate limit exceeded. Max 20 rooms per hour.' },
      { status: 429 }
    )
  }

  if (!DAILY_API_KEY) {
    return NextResponse.json(
      { error: 'Daily.co not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await req.json().catch(() => ({}))

    // Generate unique room name
    const roomName = body.roomName || `voxlink-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

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
          enable_chat: true,
          enable_knocking: false,
          enable_screenshare: false,
          enable_recording: false,
          exp: Math.floor(Date.now() / 1000) + 7200, // Expires in 2 hours
          eject_at_room_exp: true,
          enable_prejoin_ui: false,
          enable_network_ui: false,
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
          url: `https://voxlink.daily.co/${roomName}`,
          existing: true
        })
      }

      return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
    }

    const room = await response.json()
    console.log('✅ Room created:', room.name)

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
    return NextResponse.json({ error: 'Daily.co not configured' }, { status: 500 })
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

// Delete room
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roomName = searchParams.get('room')

  if (!roomName || !DAILY_API_KEY) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  try {
    await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`
      }
    })
    return NextResponse.json({ deleted: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
