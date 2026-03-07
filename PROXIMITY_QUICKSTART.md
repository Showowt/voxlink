# Proximity Connect - Developer Quick Start

**Get up and running in 10 minutes.**

## Prerequisites
- Node.js 18+
- Supabase account (free)
- Git

## Installation (2 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Create environment file
cp .env.example .env.local

# Add to .env.local:
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

## Supabase Setup (5 minutes)

### 1. Create Project
1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Name: "voxlink-proximity"
4. Generate password → Create

### 2. Enable PostGIS
**SQL Editor** → New Query:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```
Click **Run**.

### 3. Run Migrations
Copy and run these files in **SQL Editor**:

**Migration 1:**
`supabase/migrations/001_proximity_connect.sql`

**Migration 2:**
`supabase/migrations/002_proximity_rpc_functions.sql`

### 4. Get Credentials
**Settings** → **API**:
- Copy "Project URL"
- Copy "anon public" key
- Paste into `.env.local`

## Test It (3 minutes)

```bash
# Start dev server
npm run dev

# Test registration (new terminal)
curl -X POST http://localhost:3000/api/proximity/register \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test123",
    "language": "en",
    "lat": 40.7128,
    "lng": -74.0060,
    "status": "available"
  }'

# Expected: {"success":true,"userId":"...","action":"created"}

# Test nearby search
curl "http://localhost:3000/api/proximity/nearby?lat=40.7128&lng=-74.0060&radius=5000"

# Expected: {"success":true,"users":[],"count":0,"radius":5000}
```

## Usage Example

```typescript
import {
  ProximityClient,
  generateSessionId,
  getCurrentLocation
} from '@/lib/proximity-client'

// Initialize
const sessionId = generateSessionId()
const client = new ProximityClient(sessionId)

// Get location
const location = await getCurrentLocation()

// Register presence
await client.register('en', location.lat, location.lng, 'available')

// Find nearby users (5km radius)
const nearby = await client.getNearby(location.lat, location.lng, 5000)
console.log(`Found ${nearby.count} users`)

// Send request
const request = await client.sendRequest(nearby.users[0].id, 'Hello!')

// Accept request (recipient side)
const response = await client.respondToRequest(requestId, true)
if (response.roomCode) {
  // Connect to PeerJS with roomCode
  connectToCall(response.roomCode)
}
```

## React Component

Copy the example:
```bash
cp lib/proximity-example.tsx app/proximity/page.tsx
```

Visit: `http://localhost:3000/proximity`

## Deploy to Vercel

```bash
# Commit changes
git add .
git commit -m "Add Proximity Connect"
git push

# Add environment variables in Vercel dashboard:
# Settings → Environment Variables
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# Deploy
vercel --prod
```

## API Endpoints Cheat Sheet

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/proximity/register` | POST | Register presence |
| `/api/proximity/nearby` | GET | Find nearby users |
| `/api/proximity/request` | POST | Send connection request |
| `/api/proximity/request` | GET | Get pending requests |
| `/api/proximity/respond` | POST | Accept/reject |
| `/api/proximity/presence` | DELETE | Remove presence |
| `/api/proximity/presence` | PATCH | Update status |

## Common Issues

### "Missing Supabase environment variables"
→ Add variables to `.env.local` and restart dev server

### "Failed to fetch nearby users"
→ Check PostGIS is enabled: `SELECT * FROM pg_extension WHERE extname = 'postgis';`

### TypeScript errors
→ Run `npm install` then `npx tsc --noEmit`

### No users found
→ Open app in multiple browser windows/tabs (different sessions)

## Next Steps

1. ✅ Complete setup above
2. Read full docs: `PROXIMITY_CONNECT.md`
3. See example UI: `lib/proximity-example.tsx`
4. Integrate with VoxLink video calls
5. Deploy to production

## Files Reference

- **API Routes:** `app/api/proximity/*`
- **Client SDK:** `lib/proximity-client.ts`
- **Database Schema:** `supabase/migrations/*.sql`
- **Example Component:** `lib/proximity-example.tsx`
- **Full Docs:** `PROXIMITY_CONNECT.md`
- **Setup Guide:** `SETUP_PROXIMITY.md`

## Support

Questions? Check:
1. `PROXIMITY_CONNECT.md` - Complete API docs
2. `SETUP_PROXIMITY.md` - Troubleshooting guide
3. `lib/proximity-example.tsx` - Code examples

---

**Ready to build?** Start with the example component and customize from there!
