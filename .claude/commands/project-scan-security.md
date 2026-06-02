# Project Scan: Security — Before Handling Payments or User Data

## Deploy 4 parallel agents:

### Agent 1: Secrets & Environment
- Grep for hardcoded API keys, tokens, passwords in all source files
- Verify .env files are in .gitignore
- Check no secrets in NEXT_PUBLIC_ variables (client-exposed)
- Verify SUPABASE_SERVICE_ROLE_KEY never imported in client components
- Check all API routes use env vars, not hardcoded values
- Verify token signing uses strong secrets (not "fallback" or empty strings)

### Agent 2: Input Validation & Injection
- Check every API route validates input (Zod preferred)
- Look for raw SQL queries (should use parameterized Supabase client)
- Check for XSS vectors: dangerouslySetInnerHTML, unescaped user content
- Verify file uploads are size-limited and type-checked
- Check URL parameters are validated before use

### Agent 3: Authentication & Access Control
- Verify RLS enabled on ALL Supabase tables
- Check that protected routes redirect unauthenticated users
- Verify Stripe webhook validates signature before processing
- Check rate limiting on auth routes (login, signup, password reset)
- Verify session tokens have proper expiry
- Check CORS whitelist is correct (no wildcard *)

### Agent 4: Data Privacy & GDPR
- Verify data export endpoint exists and works
- Verify account deletion endpoint exists and deletes from all tables
- Check no PII in console.log statements
- Verify analytics tracking respects opt-out preferences
- Check third-party services (ElevenLabs, OpenAI, Anthropic) — what data is sent?
- Verify no user data cached in browser without consent

## After audit: Fix ALL issues regardless of severity. Security has no "low priority."
