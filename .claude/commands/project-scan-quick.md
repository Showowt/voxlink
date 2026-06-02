# Project Scan: Quick — Fast Check for Critical Issues Only

Fast scan — just compile errors + critical blockers. Takes ~2 minutes.

## Run sequentially (not parallel):

### Step 1: TypeScript Compile
```
npx tsc --noEmit
```
Report any errors with file:line.

### Step 2: Build Check
```
npx next build
```
Report any build failures.

### Step 3: Critical File Check
- Read /app/page.tsx first 30 lines — imports all resolve?
- Read /app/call/[id]/page.tsx first 30 lines — imports resolve?
- Read /app/lib/peer-connection.ts first 10 lines — no PeerJS import?
- Read /app/lib/room-signal.ts first 10 lines — exports intact?

### Step 4: Git Status
- Any uncommitted changes?
- Is local ahead of remote?
- Any merge conflicts?

### Step 5: Vercel Status
- Check latest deployment state via Vercel MCP
- Does the deployed commit SHA match local HEAD?
- Is deployment READY?

## Report: PASS/FAIL with one-line summary per step. No fixes — just diagnosis.
