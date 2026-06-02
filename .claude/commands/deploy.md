# Deploy — Build, Push, Deploy, Verify

Safe deployment pipeline with backup plan if GitHub webhook fails.

## Steps

1. **Pre-flight checks:**
   - Run `npx tsc --noEmit` — zero errors required
   - Run `npx next build` — must succeed
   - Check `git status` — no uncommitted changes

2. **Commit & Push:**
   - Stage changed files (specific files, not `git add -A`)
   - Commit with descriptive message
   - Push to origin/main

3. **Verify deployment (primary: GitHub webhook):**
   - Wait 30 seconds
   - Check Vercel deployments via MCP for new deployment matching our commit SHA
   - If found and state is BUILDING or READY, wait for READY

4. **Backup plan (if webhook didn't fire within 60s):**
   - Run `npx vercel --prod --yes` to deploy via CLI
   - This always works regardless of webhook status

5. **Confirm deployment:**
   - Verify latest Vercel deployment state is READY
   - Verify the commit SHA matches our push
   - Verify the production URL aliases include entrevoz.co
   - Report the deployment URL and status

## Never skip verification. A push is NOT a deploy.
