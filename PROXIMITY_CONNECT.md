# Proximity Connect API Documentation

Location-based user discovery and connection system for VoxLink. Enables real-time discovery of nearby users who want to practice languages through video calls.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VoxLink Client                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Geolocation │→ │ Registration │→ │ Nearby Discovery │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
│         ↓                                      ↓             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Send Request │→ │ Accept/Reject│→ │ PeerJS WebRTC   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                  Proximity Connect API                       │
│  /api/proximity/register   POST   Register presence          │
│  /api/proximity/nearby     GET    Get nearby users           │
│  /api/proximity/request    POST   Send connection request    │
│  /api/proximity/request    GET    Get pending requests       │
│  /api/proximity/respond    POST   Accept/reject request      │
│  /api/proximity/presence   DELETE Remove presence            │
│  /api/proximity/presence   GET    Get presence status        │
│  /api/proximity/presence   PATCH  Update status              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Supabase PostgreSQL                       │
│  proximity_presence    (location, status, TTL)               │
│  proximity_requests    (from/to, status, room_code)          │
│  PostGIS Extensions    (efficient geographic queries)        │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### proximity_presence
Stores active user locations with 30-minute TTL.

```sql
id              UUID PRIMARY KEY
session_id      TEXT UNIQUE (client-generated session ID)
language        TEXT (en, es, fr, de, it, pt, zh, ja, ko, ar, ru, hi)
location        GEOGRAPHY(POINT) (PostGIS indexed)
lat             DOUBLE PRECISION
lng             DOUBLE PRECISION
status          TEXT (available, busy, in_call)
user_agent      TEXT
created_at      TIMESTAMPTZ
expires_at      TIMESTAMPTZ (30 min TTL)
last_heartbeat  TIMESTAMPTZ
```

**Indexes:**
- GIST index on `location` for fast geographic queries
- B-tree indexes on `expires_at`, `language`, `status`, `session_id`

### proximity_requests
Tracks connection requests between users.

```sql
id              UUID PRIMARY KEY
from_session_id TEXT (requester)
to_session_id   TEXT (recipient)
message         TEXT (optional greeting)
status          TEXT (pending, accepted, rejected, expired)
room_code       TEXT (8-char PeerJS room code, set on accept)
created_at      TIMESTAMPTZ
responded_at    TIMESTAMPTZ
expires_at      TIMESTAMPTZ (5 min TTL)
```

**Indexes:**
- B-tree indexes on `to_session_id`, `from_session_id`, `status`, `expires_at`

## API Endpoints

### 1. POST /api/proximity/register

Register or update user presence with location. Acts as heartbeat if called repeatedly.

**Request:**
```typescript
{
  sessionId: string      // Client-generated session ID
  language: string       // ISO 639-1 language code
  lat: number           // Latitude (-90 to 90)
  lng: number           // Longitude (-180 to 180)
  status: string        // 'available' | 'busy' | 'in_call'
}
```

**Response (201 Created or 200 OK):**
```typescript
{
  success: true,
  userId: string,         // UUID of proximity_presence record
  action: 'created' | 'updated'
}
```

**Usage:**
```typescript
import { ProximityClient, generateSessionId, getCurrentLocation } from '@/lib/proximity-client'

const sessionId = generateSessionId()
const client = new ProximityClient(sessionId)
const location = await getCurrentLocation()

const result = await client.register('en', location.lat, location.lng, 'available')
```

---

### 2. GET /api/proximity/nearby

Get all available users within radius. Excludes self automatically.

**Query Parameters:**
```typescript
lat: number        // User's latitude
lng: number        // User's longitude
radius: number     // Search radius in meters (100-50000, default 5000)
sessionId: string  // Optional: exclude this session from results
```

**Response (200 OK):**
```typescript
{
  success: true,
  users: [
    {
      id: string,          // User ID (pass to sendRequest)
      session_id: string,  // Session identifier
      language: string,    // User's language
      distance: number,    // Distance in meters
      status: 'available'  // Only available users returned
    }
  ],
  count: number,
  radius: number,
  fallback: boolean  // true if using haversine instead of PostGIS
}
```

**Usage:**
```typescript
const result = await client.getNearby(location.lat, location.lng, 5000)

if (result.success) {
  result.users.forEach(user => {
    console.log(`${user.language} speaker, ${formatDistance(user.distance)} away`)
  })
}
```

---

### 3. POST /api/proximity/request

Send connection request to another user.

**Request:**
```typescript
{
  fromSessionId: string,  // Sender's session ID
  targetId: string,       // Target user ID (from nearby query)
  message?: string        // Optional greeting (max 200 chars)
}
```

**Response (201 Created):**
```typescript
{
  success: true,
  requestId: string,      // UUID of request
  expiresAt: string       // ISO timestamp (5 min from now)
}
```

**Error Responses:**
- `404`: Target user not found or offline
- `409`: Target user is busy/in_call OR request already pending

**Usage:**
```typescript
const result = await client.sendRequest(
  user.id,
  'Hey! Want to practice Spanish?'
)
```

---

### 4. GET /api/proximity/request

Get pending connection requests for current user.

**Query Parameters:**
```typescript
sessionId: string  // Current user's session ID
```

**Response (200 OK):**
```typescript
{
  success: true,
  requests: [
    {
      id: string,
      from_session_id: string,
      to_session_id: string,
      message?: string,
      status: 'pending',
      created_at: string,
      expires_at: string
    }
  ],
  count: number
}
```

**Usage:**
```typescript
const result = await client.getPendingRequests()

if (result.requests.length > 0) {
  // Show notification or modal to user
}
```

---

### 5. POST /api/proximity/respond

Accept or reject a connection request.

**Request:**
```typescript
{
  requestId: string,   // UUID of the request
  accept: boolean,     // true to accept, false to reject
  sessionId: string    // Must be the recipient's session ID
}
```

**Response (200 OK) - Rejection:**
```typescript
{
  success: true,
  accepted: false,
  message: 'Request rejected successfully'
}
```

**Response (200 OK) - Acceptance:**
```typescript
{
  success: true,
  accepted: true,
  roomCode: string,    // 8-char PeerJS room code
  request: {
    id: string,
    from_session_id: string,
    to_session_id: string
  }
}
```

**Error Responses:**
- `403`: Unauthorized (not the recipient)
- `404`: Request not found
- `409`: Request already responded to
- `410`: Request expired

**Usage:**
```typescript
// Accept request
const result = await client.respondToRequest(requestId, true)

if (result.success && result.accepted) {
  // Connect to PeerJS with roomCode
  connectToPeer(result.roomCode)
}

// Reject request
await client.respondToRequest(requestId, false)
```

---

### 6. DELETE /api/proximity/presence

Remove user presence on app close. Also cancels pending requests.

**Query Parameters:**
```typescript
sessionId: string  // User's session ID
```

**Response (200 OK):**
```typescript
{
  success: true,
  message: 'Presence removed successfully'
}
```

**Usage:**
```typescript
// Call on window.beforeunload or app exit
window.addEventListener('beforeunload', () => {
  client.removePresence()
})
```

---

### 7. GET /api/proximity/presence

Get current presence status for a session.

**Query Parameters:**
```typescript
sessionId: string
```

**Response (200 OK):**
```typescript
{
  success: true,
  presence: {
    id: string,
    session_id: string,
    language: string,
    lat: number,
    lng: number,
    status: 'available' | 'busy' | 'in_call',
    created_at: string,
    expires_at: string,
    last_heartbeat: string
  }
}
```

---

### 8. PATCH /api/proximity/presence

Update presence status (e.g., when entering/leaving a call).

**Request:**
```typescript
{
  sessionId: string,
  status: 'available' | 'busy' | 'in_call'
}
```

**Response (200 OK):**
```typescript
{
  success: true,
  status: string,
  message: 'Presence status updated successfully'
}
```

**Usage:**
```typescript
// On call start
await client.updateStatus('in_call')

// On call end
await client.updateStatus('available')
```

## Client SDK Usage

### Basic Setup

```typescript
import {
  ProximityClient,
  generateSessionId,
  getCurrentLocation,
  formatDistance
} from '@/lib/proximity-client'

// 1. Generate session ID (store in localStorage)
const sessionId = generateSessionId()
localStorage.setItem('voxlink-session', sessionId)

// 2. Initialize client
const client = new ProximityClient(sessionId)

// 3. Get location and register
const location = await getCurrentLocation()
await client.register('en', location.lat, location.lng, 'available')
```

### Discovery Flow

```typescript
// 1. Find nearby users
const nearby = await client.getNearby(location.lat, location.lng, 5000)

// 2. Display users to client
nearby.users.forEach(user => {
  console.log(`${user.language} - ${formatDistance(user.distance)}`)
})

// 3. Send request to user
const request = await client.sendRequest(user.id, 'Hello!')

// 4. Poll for pending requests (or use Supabase Realtime)
setInterval(async () => {
  const pending = await client.getPendingRequests()
  if (pending.requests.length > 0) {
    showNotification(pending.requests[0])
  }
}, 5000)
```

### Connection Flow

```typescript
// Recipient: Accept request
const response = await client.respondToRequest(requestId, true)

if (response.success && response.roomCode) {
  // Both users connect to PeerJS with roomCode
  const peer = new Peer(response.roomCode)

  // Update status
  await client.updateStatus('in_call')

  // Start WebRTC call
  // ... existing VoxLink video call logic
}

// After call ends
await client.updateStatus('available')
```

## Supabase Realtime Integration

Subscribe to incoming requests in real-time:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(url, key)

// Subscribe to requests for this session
const channel = supabase
  .channel('proximity-requests')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'proximity_requests',
      filter: `to_session_id=eq.${sessionId}`
    },
    (payload) => {
      // Show notification
      showIncomingRequest(payload.new)
    }
  )
  .subscribe()
```

## Setup Instructions

### 1. Install Dependencies

```bash
cd /Users/showowt/machinemind-builds/voxlink
npm install @supabase/supabase-js
```

### 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Copy Project URL and Anon Key

### 3. Enable PostGIS Extension

In Supabase SQL Editor:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 4. Run Migrations

Copy SQL from `/supabase/migrations/` and run in Supabase SQL Editor:
1. `001_proximity_connect.sql` - Create tables, indexes, RLS
2. `002_proximity_rpc_functions.sql` - Create PostGIS functions

### 5. Configure Environment Variables

Add to `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

### 6. Deploy to Vercel

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

## Security Features

1. **Row Level Security (RLS)** enabled on all tables
2. **TTL-based expiry** - presence expires after 30 min, requests after 5 min
3. **Input validation** using Zod schemas on all endpoints
4. **Session verification** - only recipient can respond to requests
5. **Status checks** - can't send requests to busy/in_call users
6. **Rate limiting** - recommended via Vercel middleware

## Performance Optimizations

1. **PostGIS ST_DWithin** - O(log n) geographic queries with GIST index
2. **Automatic cleanup** - expired records removed via cron
3. **Haversine fallback** - works without PostGIS for testing
4. **Indexed queries** - all foreign keys and filters indexed
5. **Connection pooling** - Supabase handles automatically

## Monitoring

Query analytics:

```sql
SELECT * FROM get_presence_stats();
-- Returns: total_active, available_count, busy_count, in_call_count,
--          pending_requests, accepted_today
```

## Error Handling

All endpoints return consistent error format:

```typescript
{
  success: false,
  error: string,        // Human-readable error message
  details?: any         // Optional validation errors (Zod)
}
```

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request (invalid input)
- `403` - Forbidden (unauthorized)
- `404` - Not Found
- `409` - Conflict (duplicate/busy)
- `410` - Gone (expired)
- `500` - Internal Server Error

## Future Enhancements

1. **Language Filtering** - Only show users learning your native language
2. **Reputation System** - Rate calls, filter by rating
3. **Scheduled Sessions** - Book calls in advance
4. **Push Notifications** - Native mobile notifications via FCM
5. **WebSocket Signaling** - Replace polling with real-time updates
6. **Privacy Zones** - Fuzzy location display (show city, not exact coords)
7. **Conversation History** - Track past successful connections
8. **Analytics Dashboard** - Admin view of usage patterns

## Testing

```bash
# Test registration
curl -X POST http://localhost:3000/api/proximity/register \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test123","language":"en","lat":40.7128,"lng":-74.0060,"status":"available"}'

# Test nearby search
curl "http://localhost:3000/api/proximity/nearby?lat=40.7128&lng=-74.0060&radius=5000&sessionId=test123"

# Test request
curl -X POST http://localhost:3000/api/proximity/request \
  -H "Content-Type: application/json" \
  -d '{"fromSessionId":"test123","targetId":"uuid-here","message":"Hello!"}'
```

## Support

For issues or questions:
- GitHub: [VoxLink Repository](https://github.com/yourusername/voxlink)
- Email: support@voxlink.app
- Discord: [VoxLink Community](https://discord.gg/voxlink)
