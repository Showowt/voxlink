# "Both joined but media never connects" — fix & roadmap (2026-10-18)

## The problem (the SECOND root cause, separate from the ring/wake work)
~20% of calls where BOTH sides join the room never establish media (no audio/video —
"it rings, we're both in, nothing happens"). Measured from diag_events: last 14d, of 10
rooms where ≥2 devices beaconed `joined-room`, 8 reached `partner-connected`, **2 failed**.
(15 more rooms had only one joiner = the ring/wake gap, fixed separately.)

Architecture: **video = Daily.co** (`app/lib/daily-connection.ts`); audio `/talk` + group +
ring-peer = **PeerJS** + `/api/turn` (TURN is healthy in prod: Metered, 5 relay servers,
Colombia-hardened). The misleading `CURRENT_PROVIDER="peerjs"` in `video-provider.ts` is
stale — the call page instantiates `DailyConnection` directly. So the failures are **Daily-specific**.

## Root cause — VD-1 / NWK-1 (P1, confirmed by a 6-lens/29-finding fleet; explains both forensic rooms)
A host **waiting alone has zero liveness/re-poll**: `connect()` checks for the partner exactly
once, then relies entirely on a single `participant-joined` event. keep-alive + stats only start
AFTER a partner is seen. So if that one event is dropped — **native iOS WKWebView suspended during
a long ring, or a silently-dead SFU socket** — the host is stranded in `waiting` forever:
`onPartnerJoined`/`onRemoteStream` never fire, `hasPartner` stays false, no connect.
- **7SM5D5** (both native-host-involved, 19s gap): connect-time one-shot missed the not-yet-joined
  answerer; later event lost → neither connected.
- **HA96H5** (asymmetric): Phil (native host) waited 2 min (screen locked), missed Esposa's
  `participant-joined`; web answerer saw his media and connected, but he never saw her. Resume didn't
  rescue it because the recovery light-path refreshes media but never re-polls participants.

## Shipped (LIVE on www.entrevoz.co)
- **Waiting watchdog** (`daily-connection.ts`): while no remote, re-poll `participants()` every 3s and
  (a) bind a partner we missed, (b) `recover()` if the SFU is silently dead. Cleared once connected /
  on disconnect / recover. Runs for BOTH roles. Kills the single-event point of failure.
- **`resyncParticipants()`** + called from the call page resume light-path (`app/call/[id]/page.tsx`):
  a suspended-then-resumed host with a live SFU now re-scans for the partner it missed (the HA96H5 fix).
- **Answerer bypasses the budget-503** (`/api/daily/room`): the global Daily cost kill-switch only gates
  the host who creates the room; 503'ing the answerer left a one-sided dead room (same bug the minute-402
  gate was already fixed for).
- **Daily-funnel instrumentation** — the connect lifecycle was 100% dark (0 `daily-*` events in 14d).
  New beacons (allowlisted + live-verified): `daily-joined` → `daily-partner-seen` → `partner-connected`,
  plus `daily-join-failed{status,reason}`, `daily-left-meeting`, `daily-recover{result}`,
  `waiting-no-partner` (alone >25s), and server-side `gate-hit{kind:budget|minutes,side,status}` in
  `/api/daily/room`. Now any failed room is readable per-arrow.
- Gates **exonerated** for the forensic rooms: Phil + Esposa are both in `PREMIUM_DEVICE_IDS`, so the
  minute-402 never fired. Both on ua=web/ios confirmed.

### How to diagnose the NEXT failed call (the funnel)
`joined-room` (tapped Join) → `daily-joined` (SFU ok) → `daily-partner-seen` (saw remote) →
`partner-connected` (hasPartner). Whichever arrow is missing names the break:
- no `daily-joined` → room/token/join failed (check `daily-join-failed` / `gate-hit`).
- `daily-joined` but no `daily-partner-seen` → the waiting-watchdog case (now auto-recovers) or a real no-show (`waiting-no-partner`).
- `daily-partner-seen` but no `partner-connected` → media/track issue (autoplay, tracks).

## AUDIO-1 — audio fallback bulletproofed (SHIPPED 2026-10-18, LIVE)
`/talk` is PeerJS **DataConnection-only** (translated text/TTS over the data channel — no raw media
`peer.call()`), but the data channel still needs TURN relay on symmetric NAT. It had NO relay-only
escalation, so on Colombian symmetric NAT (Claro/Tigo/Movistar) the channel could silently never open.
Mirrored the proven `peer-connection.ts` pattern into `talk-connection.ts`:
- `buildPeerConfig()` honors a `useRelayOnly` flag (`iceTransportPolicy: 'relay' | 'all'`).
- `armRelayEscalation()` (GUEST-only — a guest relay candidate pairs with the host's relay candidate,
  already in its `all` set, so one-sided relay-only covers both-symmetric-NAT and avoids host id churn):
  10s after signaling is up, if the data channel still isn't open → `rebuildPeerRelayOnly()` (fresh peer
  id, relay-only config, re-advertise via RoomSignal, guest re-drives attempts).
- Cleared on data-channel open + disconnect. Beacon `talk-relay-escalation{room,isHost}` (allowlisted +
  live-verified) so we can measure how often the audio fallback needs relay in CO.

## GF2F-2/3 — group instrumentation (SHIPPED 2026-10-18, LIVE)
Group (`hooks/useGroupCall.ts`) was 100% uninstrumented. Added the mesh connect funnel mirroring 1:1:
- `setPhase`: `joined-room{surface:'group'}` on phase→active (once); `call-error{surface:'group',error}` on phase→error.
- `adoptMediaConn` `mc.on('stream')`: `group-peer-seen{slot}` per peer + `partner-connected{surface:'group'}`
  on the FIRST remote media (once). So a group "both-joined-no-media" is visible when joined-room fires
  but partner-connected never does — same classifier as 1:1. (`group-peer-seen` allowlisted + live-verified.)
- **Face-to-Face is EXEMPT (GF2F-5, confirmed):** it is single-device, "NO networking, NO WebRTC, dual
  SpeechRecognition" (app/face-to-face/page.tsx:28) — two people on one phone. No connection = not subject
  to connect failure. Its only failure mode is STT (separate concern); no connect funnel added.

## GF2F-4 — group per-slot media watchdog (SHIPPED 2026-10-18, LIVE)
The mesh data channel had a retry loop, but once it opened `startMediaCall` fired the media
`peer.call()` ONCE. If that media leg's ICE failed (while data stayed healthy, so the heartbeat
never flagged it) the tile stayed blank forever. Added a per-slot watchdog in `hooks/useGroupCall.ts`:
- After `startMediaCall`, `armMediaWatchdog(slot,peerId)`: if no `mc.on('stream')` within
  `MEDIA_WATCHDOG_MS` (6s), close the dead media conn and re-`peer.call()`, up to `MAX_MEDIA_ATTEMPTS`
  (3). Guards: only while active, data channel still open, slot not reassigned.
- `mc.on('stream')` marks the slot arrived + clears the watchdog. State reset in removeParticipant /
  retryConnection / teardownConnections.
- Beacon `group-media-retry{slot,attempt}` (allowlisted + live-verified) to measure how often the media
  leg needs re-calling.

## AUDIO-4 + ghost-participant edge (SHIPPED 2026-10-18, LIVE) — last P3s
- **AUDIO-4:** the `/talk` page's foreground recovery bailed on `!hadPartnerRef.current` — so a callee
  suspended while WAITING (never connected) never resumed connecting, even as the caller kept ringing.
  Added `TalkConnection.resume()` (reconnect the dead PeerJS signaling socket + reset the guest's attempt
  guard/budget and re-drive `startConnectionAttempts`), and the talk page now calls it whenever not
  connected (before the had-partner/reload gate), covering the waiting case directly (no reload needed).
- **Ghost-participant 1:1-cap (VD-4/GF-4):** `daily-connection.ts` `participant-joined` enforced the
  `remotes.length>1` cap unconditionally, so a stale/ghost participant from a prior attempt made the
  handler IGNORE the real arrival → stranded in 'waiting'. Now the cap is enforced ONLY once
  `_status==='connected'` (reject a genuine 3rd joiner); before connecting, the newcomer is always bound.
  (The waiting-watchdog already bypassed the cap as a backstop; this fixes the primary event path.)

## NWK-3 wake-lock (SHIPPED 2026-10-18, LIVE) — nothing left
`hooks/useWakeLock.ts`: Screen Wake Lock during a call so iOS doesn't auto-lock and suspend the
WebView in the first place (PREVENTS the freeze AUDIO-4 / the watchdogs recover from). Best-effort +
feature-detected; re-acquires on visibility (OS releases on hide); released on cleanup / when inactive.
Wired: call page `useWakeLock(!inLobby && status!=='error')`, talk page
`useWakeLock(!talkNoAnswer && !partnerDeclined)`, group page `useWakeLock(phase==='active'||'joining')`.

## ✅ Every confirmed finding from both media-connect audits is now shipped.
- **VD-4/GF-4 (P3):** stale/ghost Daily participant can make the 1:1 cap ignore the real partner
  (the watchdog binds `remotes[0]`, mitigating most cases).
- Refuted: VD-3, NWK-5, GF2F-1.

## ⚠️ Deploy note
Shipped via `vercel --prod` (CLI) — GitHub token still invalid. This fix's commit is LOCAL ONLY, as
are 0c6d28e + f61c2e7 (the ring-wake work). Push all three to `origin/main` once `gh auth login` is run.
