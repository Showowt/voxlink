# Proximity Connect Setup Guide

Complete setup instructions for deploying Proximity Connect to VoxLink.

## Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- Vercel account (for deployment)
- Browser with geolocation support

## Step 1: Install Dependencies

```bash
cd /Users/showowt/machinemind-builds/voxlink
npm install @supabase/supabase-js
```

## Step 2: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose organization, name: "voxlink-proximity"
4. Generate a strong database password
5. Select region closest to your users
6. Wait for project to finish provisioning (~2 minutes)

## Step 3: Enable PostGIS Extension

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Paste and run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

4. You should see: "Success. No rows returned"

## Step 4: Run Database Migrations

### Migration 1: Create Tables

1. In SQL Editor, create new query
2. Copy contents from `/supabase/migrations/001_proximity_connect.sql`
3. Click **Run**
4. Verify tables created: Go to **Table Editor** → should see:
   - `proximity_presence`
   - `proximity_requests`

### Migration 2: Create RPC Functions

1. In SQL Editor, create new query
2. Copy contents from `/supabase/migrations/002_proximity_rpc_functions.sql`
3. Click **Run**
4. Verify functions created: Go to **Database** → **Functions** → should see:
   - `find_nearby_users`
   - `get_presence_stats`

## Step 5: Configure Environment Variables

### Local Development

1. Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

2. Get Supabase credentials:
   - Go to Supabase dashboard → **Settings** → **API**
   - Copy **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - Copy **anon/public** key (starts with `eyJ...`)

3. Edit `.env.local`:

```bash
# Existing variables
VOXLINK_ACCESS_CODE=2468
TURN_USERNAME=your_turn_username
TURN_CREDENTIAL=your_turn_credential
METERED_API_KEY=your_metered_api_key

# Add Supabase variables
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Vercel Production

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your VoxLink project
3. Go to **Settings** → **Environment Variables**
4. Add two new variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
5. Apply to **Production**, **Preview**, and **Development**
6. Click **Save**

## Step 6: Test Locally

```bash
npm run dev
```

Open browser to `http://localhost:3000` and test the API:

### Test 1: Health Check

```bash
curl http://localhost:3000/api/health
```

Should return JSON with service statuses.

### Test 2: Register Presence

```bash
curl -X POST http://localhost:3000/api/proximity/register \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-session-123",
    "language": "en",
    "lat": 40.7128,
    "lng": -74.0060,
    "status": "available"
  }'
```

Expected response:
```json
{
  "success": true,
  "userId": "uuid-here",
  "action": "created"
}
```

### Test 3: Get Nearby Users

```bash
curl "http://localhost:3000/api/proximity/nearby?lat=40.7128&lng=-74.0060&radius=5000"
```

Expected response:
```json
{
  "success": true,
  "users": [],
  "count": 0,
  "radius": 5000
}
```

### Test 4: TypeScript Compilation

```bash
npx tsc --noEmit
```

Should complete with no errors.

## Step 7: Deploy to Vercel

```bash
# Commit changes
git add .
git commit -m "Add Proximity Connect API"

# Push to GitHub
git push origin main

# Deploy (if not auto-deployed)
vercel --prod
```

Vercel will automatically:
1. Detect Next.js project
2. Install dependencies
3. Build the app
4. Deploy to production

## Step 8: Verify Production

Once deployed, test the production API:

```bash
# Replace with your Vercel URL
VERCEL_URL="https://voxlink.vercel.app"

curl -X POST $VERCEL_URL/api/proximity/register \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "prod-test-123",
    "language": "en",
    "lat": 40.7128,
    "lng": -74.0060,
    "status": "available"
  }'
```

## Step 9: Monitor Database

Check that data is being stored correctly:

1. Go to Supabase dashboard → **Table Editor**
2. Select `proximity_presence` table
3. You should see your test record with:
   - `session_id`: "prod-test-123"
   - `language`: "en"
   - `lat`: 40.7128
   - `lng`: -74.0060
   - `expires_at`: ~30 minutes from now

## Step 10: Set Up Automatic Cleanup (Optional)

Expired records are automatically cleaned when API endpoints run checks, but you can add a cron job for proactive cleanup:

### Using Supabase pg_cron

1. In SQL Editor, run:

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup every 5 minutes
SELECT cron.schedule(
  'proximity-cleanup',
  '*/5 * * * *',
  $$SELECT cleanup_expired_proximity_data()$$
);
```

2. Verify cron job:

```sql
SELECT * FROM cron.job;
```

### Using Vercel Cron (Paid Plans)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/proximity-cleanup",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Create `/app/api/cron/proximity-cleanup/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  await supabase.rpc('cleanup_expired_proximity_data')
  return NextResponse.json({ success: true })
}
```

## Step 11: Integrate with VoxLink UI

See `/lib/proximity-example.tsx` for a complete React component example.

### Quick Integration

1. Copy the example component to your app:

```bash
cp lib/proximity-example.tsx app/proximity/page.tsx
```

2. Add route to navigation in `app/page.tsx`:

```tsx
<Link href="/proximity">
  <button className="bg-[#d4af37] text-black px-6 py-3 rounded-lg">
    Find Nearby Users
  </button>
</Link>
```

3. Test by visiting `http://localhost:3000/proximity`

## Troubleshooting

### Issue: "Missing Supabase environment variables"

**Solution:** Make sure `.env.local` exists with correct values. Restart dev server after adding env vars.

### Issue: "Failed to fetch nearby users"

**Solution:** Check PostGIS extension is enabled:
```sql
SELECT * FROM pg_extension WHERE extname = 'postgis';
```

### Issue: "Network error" in browser console

**Solution:**
1. Check browser console for CORS errors
2. Verify Supabase URL is correct (no trailing slash)
3. Check Supabase dashboard → Settings → API → "API Settings" → ensure "Allow access from all origins" is checked for development

### Issue: TypeScript errors on import

**Solution:** Make sure tsconfig.json has correct paths:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"],
      "@/lib/*": ["./lib/*"],
      "@/app/*": ["./app/*"]
    }
  }
}
```

### Issue: "Permission denied" in Supabase queries

**Solution:** RLS is enabled but policies allow all access. Check:
```sql
SELECT * FROM proximity_presence LIMIT 1;
```

If this fails, re-run migration 001 to create policies.

### Issue: Users not appearing in nearby search

**Solution:**
1. Make sure `expires_at` is in the future (30 min TTL)
2. Check `status` is 'available'
3. Verify location coordinates are valid (-90 to 90 lat, -180 to 180 lng)
4. Try increasing search radius

## Performance Tips

1. **Index Usage:** PostGIS GIST index on `location` column makes geographic queries fast
2. **Connection Pooling:** Supabase handles this automatically
3. **Caching:** Consider adding Redis for high-traffic scenarios
4. **Rate Limiting:** Add rate limiting middleware in production

## Security Checklist

- [x] RLS enabled on all tables
- [x] Input validation with Zod schemas
- [x] TTL-based expiry for presence and requests
- [x] Session verification on request responses
- [x] Status checks prevent invalid connections
- [x] No sensitive data in client code

## Next Steps

1. Add language filtering to nearby search
2. Implement reputation/rating system
3. Add push notifications for mobile
4. Create admin dashboard for analytics
5. Add WebSocket for real-time updates (replace polling)

## Support

For issues or questions:
- Check documentation: `/PROXIMITY_CONNECT.md`
- Review example code: `/lib/proximity-example.tsx`
- Test API routes: `/app/api/proximity/**`
- Database schema: `/supabase/migrations/*.sql`
