# Ring-when-closed / Wake Layer — state & roadmap (2026-10-17)

## The problem (root cause of "rings forever, never connects")
A backgrounded/**closed** web callee had **no way to be woken**. Proven by diag
beacons + DB forensics + a 6-subsystem / 21-finding agent audit (13 confirmed, 2 P0):
- Realtime broadcast only reaches a **live** websocket.
- Store-and-forward pull (`/api/ring/pending`) only runs while the app is **foregrounded**.
- Native VoIP is **dead**: `push_tokens` is empty (no build-12 device has registered a token).
- The recording's dial targeted the **correct** current id (`84308f39`) — drift was NOT the cause.

So a correct dial into a closed phone rang into the void. The receive side (listen on all
known ids + codes, rebuild on resume, HTTP pull) is solid — it just needs the app running.

## Shipped (LIVE on www.entrevoz.co, commit 0c6d28e)
**Web Push (VAPID) wake layer** — wakes a closed/backgrounded web/PWA phone:
- `public/push-sw.js` — push-only SW. **No fetch handler, no caching** (cannot re-cause the
  stale-bundle bug). Shows the call notification + `postMessage`s open tabs to pull the ring now.
- `push_subscriptions` table (service-role only) + `POST /api/push/web-subscribe`.
- `app/lib/web-push.ts` — VAPID send; fired from `/api/ring/send` **only on the fresh-insert
  branch** (one push per ring, not per 2.5s re-ring tick); auto-prunes dead (404/410) subs.
- `app/lib/web-push-client.ts` + `NotificationEnablePrompt.tsx` — subscribe + bilingual enable
  prompt with iOS **Add-to-Home-Screen** guidance. `AppShell` auto-subscribes granted devices.
- `self-healing.ts` — keeps `push-sw.js`, still kills the legacy caching `sw.js`.
- `useIncomingCall` — pulls immediately on the SW `entrevoz-ring-wake` message.

**Verified live:** push-sw served (200); web-subscribe validates; `/api/ring/send` with a
subscription inserts the ring_invite, sends the VAPID push, and prunes the dead endpoint — all
`{ok:true}`, no 500.

**Also shipped (confirmed findings):**
- History **drift-healing**: re-resolve a partner whose stored id left the directory to their
  CURRENT device by `display_name` (unambiguous single match only); dial `partner_current_device`.
- Directory code lookup now uses `normalizeDialCode` (DIALCODE-4) — no false "code not found".

## Required user action (one-time, per callee)
Web Push can only wake an **installed PWA** on iOS (16.4+). For Esposa on iPhone, EITHER:
1. Open entrevoz.co in Safari → Share → **Add to Home Screen** → open from there → tap the
   "Enable" prompt (grants notifications → subscription registered), OR
2. Install the **native build-12** app (TestFlight/App Store) → VoIP/CallKit rings when closed
   (populates `push_tokens`). This gives the best UX (full-screen CallKit ring).

Android/desktop Chrome: just tap "Enable" (no install needed).

## Next tranche (confirmed but deferred)
- **IDENT-3 (durable fix): ring by account.** `device_accounts` (device_id→user_id) exists but
  is unused by dial paths. Link every device to a user_id on boot (api/account/link-device),
  register directory rows WITH user_id, and have the callee subscribe to a stable
  `ring-acct-<user_id>` channel + caller resolve contact→user_id→current device(s). Makes drift
  irrelevant. Largest change; highest durability.
- **SMS / WhatsApp "tap-to-answer" fallback** (Twilio) — the only path to someone with NO app.
  Needs phone-number capture (we key by device_id today; add optional phone collection).
- **Server-side VoIP from `/api/ring/send`** (WAKE-3) so the push survives the caller tab closing
  (today it's client-fired from `sendCallInvite`). No-op until push_tokens is populated.
- **Missed-call surface / longer ring_invite retention** (RECV-2) — show missed rings on next open.
- **Suppression diag beacon** (RECV-3) — beacon when a ring is throttled/blocked/busy-declined so
  "silent ring" can be told apart from "no listener" in telemetry.
- Refuted/non-issues: SEND-2, DIALCODE-3, HIST-3 (writes fine), RECV-3/4 machinery (correct).

## ⚠️ Deploy note
Shipped via `vercel --prod` (CLI) because the GitHub token was invalid (`gh auth login` needed).
**Commit 0c6d28e is LOCAL ONLY — push it to `origin/main` once GitHub auth is restored**, else a
future `git push` from another session will deploy a tree missing this fix (regression).
VAPID env (VAPID_PUBLIC_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) are
set in Vercel production.

## Red-team pass (2026-10-18) — 9 lenses, 34 confirmed findings, 5 must-fix. FIXED + redeployed:
- **MRC-2 (P1, broke the fix): caller abandoned at 45s and CANCELED the ring** before a push-woken web
  phone (observed 60-125s to open+join) could answer. Fixed in `app/call/[id]/page.tsx` + `app/talk/[id]/page.tsx`:
  window 45s→90s, and on no-answer timeout DO NOT cancel the persisted invite (leave it ringing so a late
  pickup still connects while the caller is on-screen; End/back/unload still cancel). **This was the fix
  that made the wake layer actually complete the call.**
- **SEC-01/PL-2/SEC-03 (P1 security): unauthenticated web-subscribe + push-by-public-dial-code** let anyone
  who knew a victim's shareable code register their endpoint and intercept the victim's call pushes (metadata
  + room code), or flood 20 junk subs to make them unreachable. Fixed: `web-push.ts` now resolves the dialed
  address to the callee's CURRENT device id (via directory) and pushes ONLY by device_id (never dial_code),
  freshest-10. `web-subscribe` now derives dial_code server-side from deviceId (ignores client code). Residual:
  device-id is still a bearer (same as the rest of the app — the broad session-auth P0 in AUDIT_LEDGER).
- **RF-3 (P3→latent 500): web-subscribe inserted unvalidated userId into a uuid column.** Fixed: UUID regex or null.
- **CS-2: Web Push sub not refreshed on mid-session id drift.** Fixed: AppShell re-subscribes on `entrevoz:device-id-restored`.
- **DEDUP-1: `uq_ring_room_addr` unique index existed in prod with no migration.** Added migration (idempotent).
- **SW-2 adoption: 0 subscriptions in prod (expected pre-adoption).** Added `web-push-subscribed` diag beacon to measure real coverage. NOTE: Esposa's device 84308f39 is **ua=web** (confirmed, active today) → Web Push IS her path (not native).
- VERIFIED LIVE post-fix: ring-by-CODE resolves code→device→push→prune (device-id-only), {ok:true} no 500.

### STILL OPEN — investigate next (NOT fixed, confirmed real):
- **★ MRC-1 (P2): a SEPARATE "both joined, no media" failure** — room 7SM5D5 shows Esposa received+accepted+JOINED
  yet the call never reached partner-connected. This is a WebRTC/Daily/TURN connect-after-join bug the wake layer
  does NOT touch (Colombia TURN? iOS getUserMedia gesture? Daily token?). Needs its own deep dive into
  `peer-connection.ts` / `/api/turn` / Daily join. Likely the "rings, connects, but no audio/video" complaints.
- **MRC-5 (P3): answerer video-minute gate can 503 the callee's room join** even when the caller has minutes (asymmetric dead-end).
- Native VoIP still dead (push_tokens empty; the 3 native devices are likely on builds ≤11). Install build-12 to populate.
- Minor/UX P3s accepted-and-documented: double web push on code-dial (tag dedupes the notification), SW update-window
  unregister race (SW-3), ios-install banner dead-end (CS-4), permission-dismiss snoozes 3d (CS-5), dead ?ring deep-link
  params (homepage relies on pull, which works), unindexed display_name scan in history enrichment (DD-5, small histories).
