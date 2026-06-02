# Project Scan: Backend — API & Database Deep Audit

Run after building APIs, before going live.

## Deploy 4 parallel agents:

### Agent 1: API Route Health
- Read every file in /app/api/**/*.ts
- For each route verify: try/catch wrapper, input validation, rate limiting, proper HTTP status codes
- Check env vars: which are required? Are they validated on use?
- Check timeouts: any route that calls external APIs must have AbortSignal.timeout
- Check maxDuration settings match Vercel plan limits

### Agent 2: Supabase Database
- List all tables via Supabase MCP
- Verify RLS is enabled on every table
- Check that code references match actual table/column names
- Verify indexes exist for common query patterns
- Check for missing tables that code references

### Agent 3: Authentication & Authorization
- Trace auth flow: signup, login, session refresh, logout
- Verify service role key only used server-side (never in client code)
- Verify anon key only used client-side
- Check middleware protects authenticated routes
- Verify webhook signature validation

### Agent 4: Data Flow & Integration
- Trace data from user input to database and back
- Check for race conditions in concurrent writes
- Verify Supabase Realtime channels are properly subscribed/unsubscribed
- Check for memory leaks in server-side caches
- Verify CORS headers on public-facing APIs

## After audit: Fix all CRITICAL and HIGH issues, build, deploy.
