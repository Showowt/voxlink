# Project Scan — Full Feature Audit + Fix Pipeline

Deploy 8 parallel agents as two competing teams to audit and fix every feature in this app.

## Team Alpha (Feature-by-Feature)
1. **Alpha-1**: Scan Language OS / Practice — verify all built-in languages work, personas load, SRS cards exist, progress saves
2. **Alpha-2**: Scan Homepage & Navigation — every tab, every button, every link. Find dead links, missing pages, broken flows
3. **Alpha-3**: Scan Wingman & Nearby/Proximity — verify pages load, all languages available, API routes respond
4. **Alpha-4**: Scan ALL API routes — error handling, rate limiting, env vars, timeouts, CORS

## Team Beta (Cross-Cutting)
5. **Beta-1**: Deep audit the video call page — WebRTC connection flow, transcription hooks, voice dubbing, captions
6. **Beta-2**: Auth, payments, dashboard — Supabase auth, Stripe checkout, subscription gating, webhook validation
7. **Beta-3**: Talk mode & Group calls — backward compat, Supabase tables exist, PeerJS still works for legacy
8. **Beta-4**: UI polish & mobile — safe areas, 44px touch targets, dark mode, loading/error states, PWA manifest

## After Audit
- Compile all findings into a prioritized fix list
- Fix everything CRITICAL and HIGH automatically
- Run TypeScript check + full build
- Commit, push, deploy to Vercel production
- Verify deployment succeeded

## Rules
- Read EVERY file before editing
- Make MINIMAL changes — don't refactor working code
- TypeScript strict — no `any` types
- Every async operation needs try/catch
- 44px minimum touch targets on all buttons
- Dark mode only: bg-[#060810], accent #00C896
- Run `npx tsc --noEmit` after all changes
- Run `npx next build` before deploying
- Verify Vercel deployment is READY before confirming
