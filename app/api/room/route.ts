import { NextRequest, NextResponse } from 'next/server'

// ═══════════════════════════════════════════════════════════════════════════════
// ROOM SIGNALING API - Simple room coordination for PeerJS
// Stores host peer IDs so guests can discover them
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

// In-memory room registry (resets on cold start, but that's fine for our use case)
// Key: roomId, Value: { hostPeerId, timestamp, hostName }
const roomRegistry = new Map<string, {
  hostPeerId: string
  hostName: string
  timestamp: number
}>()

// Clean up old rooms (older than 2 hours)
function cleanupOldRooms() {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
  const entries = Array.from(roomRegistry.entries())
  for (const [roomId, data] of entries) {
    if (data.timestamp < twoHoursAgo) {
      roomRegistry.delete(roomId)
    }
  }
}

// POST - Host registers their peer ID
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { roomId, hostPeerId, hostName } = body

    if (!roomId || !hostPeerId) {
      return NextResponse.json(
        { error: 'roomId and hostPeerId required' },
        { status: 400 }
      )
    }

    // Clean up old rooms periodically
    cleanupOldRooms()

    // Register the room
    roomRegistry.set(roomId, {
      hostPeerId,
      hostName: hostName || 'Host',
      timestamp: Date.now()
    })

    console.log(`📍 Room registered: ${roomId} -> ${hostPeerId}`)

    return NextResponse.json({
      success: true,
      roomId,
      hostPeerId
    })
  } catch (error) {
    console.error('Room registration error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// GET - Guest looks up host's peer ID
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roomId = searchParams.get('roomId')

  if (!roomId) {
    return NextResponse.json(
      { error: 'roomId required' },
      { status: 400 }
    )
  }

  const roomData = roomRegistry.get(roomId)

  if (!roomData) {
    return NextResponse.json({
      found: false,
      roomId
    })
  }

  // Check if room is stale (older than 30 minutes with no activity)
  const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
  if (roomData.timestamp < thirtyMinutesAgo) {
    roomRegistry.delete(roomId)
    return NextResponse.json({
      found: false,
      roomId,
      reason: 'expired'
    })
  }

  return NextResponse.json({
    found: true,
    roomId,
    hostPeerId: roomData.hostPeerId,
    hostName: roomData.hostName
  })
}

// DELETE - Clean up room when host leaves
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const roomId = searchParams.get('roomId')

  if (!roomId) {
    return NextResponse.json(
      { error: 'roomId required' },
      { status: 400 }
    )
  }

  roomRegistry.delete(roomId)
  console.log(`🗑️ Room removed: ${roomId}`)

  return NextResponse.json({
    success: true,
    roomId
  })
}
