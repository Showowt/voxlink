# Project Scan: Deploy — Final Pre-Production Checklist

Last gate before pushing to production. Nothing gets through without passing ALL checks.

## Phase 1: Code Quality (parallel agents)

### Agent 1: TypeScript + Build
- `npx tsc --noEmit` — ZERO errors
- `npx next build` — succeeds with no warnings about missing pages
- All new routes appear in build output

### Agent 2: Git Hygiene
- `git status` — no uncommitted changes (or commit them first)
- `git diff origin/main` — review what's about to deploy
- No .env files staged
- No console.log statements (check next.config has removeConsole)
- No TODO/FIXME comments in changed files

## Phase 2: Runtime Verification

### Agent 3: API Smoke Test
- Check /api/health returns 200
- Check /api/translate accepts POST with valid body
- Check /api/turn returns ICE servers
- Verify all required env vars are set in Vercel dashboard

### Agent 4: Page Load Test
- Verify every page.tsx has a matching loading.tsx
- Check no import references missing files
- Verify Supabase tables exist for all queried tables

## Phase 3: Deploy

1. `git push origin main`
2. Wait 30s for GitHub webhook
3. Check Vercel for new deployment
4. If no deployment after 60s: `npx vercel --prod --yes`
5. Wait for READY state
6. Verify production URL resolves (curl entrevoz.co)
7. Verify commit SHA matches on Vercel deployment

## Phase 4: Post-Deploy

1. Check Vercel deployment logs for runtime errors (first 2 minutes)
2. Verify /api/health returns 200 on production
3. Report: DEPLOYED with commit SHA, timestamp, and URL

## NEVER skip Phase 1. A broken build should NEVER reach production.
