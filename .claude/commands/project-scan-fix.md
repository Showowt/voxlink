# Project Scan: Fix — You Know What's Broken, Just Fix It

Skip the audit. Deploy fix agents directly.

## Input
Describe what's broken. Examples:
- "proximity page crashes"
- "translation API returns 500"
- "video call won't connect"
- "dashboard shows blank"

## Process

### Step 1: Diagnose (1 agent)
- Read the specific files related to the issue
- Trace the error path
- Identify root cause with file:line

### Step 2: Fix (1 agent)
- Read the file completely before editing
- Make minimal targeted fix
- No refactoring, no "improvements" beyond the fix

### Step 3: Verify
- `npx tsc --noEmit` — zero errors
- `npx next build` — succeeds
- Test the specific flow that was broken

### Step 4: Deploy
- Git add specific files (not -A)
- Commit with descriptive message: "fix: [what was broken]"
- Push to origin/main
- Deploy via `npx vercel --prod --yes` (don't wait for webhook)
- Verify deployment is READY

## Rules
- Read before edit. Always.
- One fix at a time. Test between fixes.
- If the fix breaks something else, revert and try again.
- Never skip the build check.
