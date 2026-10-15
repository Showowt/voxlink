# Entrevoz — Freemium Launch & Monetization Plan
*2026-10-15 · based on full code + App Store Connect audit at main `beee7bc`*

## Where we actually are

**The web monetization stack is ~95% built** (far more than expected):
- Supabase email auth with `profiles.plan` (free/pro/enterprise), `trial_ends_at` defaulting to **NOW()+7 days** on signup
- Stripe: checkout (`trial_period_days: 7`), webhook plan-sync, customer portal — all wired (`app/api/stripe/*`)
- Usage machinery: `usage_events`, `daily_usage`, `feature_usage`, `streaks` tables + `lib/usage.ts` limits + `/api/usage/check|track`
- Pricing page live on web, **hidden from the iOS shell by user-agent** (`EntrevozApp/1.0`), enforced by `native/verify-iap-gate.mjs`

**iOS**: approved as a **100% free app** (Guideline 3.1.1 — all paid surfaces were stripped from the shell to pass review). Zero StoreKit/RevenueCat code; App Store Connect has **no IAPs and no subscription groups**. First IAP would require a new version submission + review.

**The holes (what the audit found):**
1. **Free limits don't match the launch model**: code has `video_call: 0` free and Pro at **$12.99/mo**; plan is 10 free video-min/mo and ~$5.99.
2. **The expensive routes are NOT actually gated.** `/api/daily/room` (Daily.co per-minute billing) never checks plan or budget. `/api/voice-clone` (~$0.50–1.00 per clone!) has only a 3/min in-memory limit. `/api/transcribe` (Whisper) is 120/min/IP. A viral spike today = unbounded spend.
3. **Most rate limits are in-memory** and reset on every serverless cold start (voice-dub, voice-clone, tts, transcribe, cyrano, summary, tone, turn). Only translate/los-chat/daily-room/usage use Redis (and only if Upstash env vars are set).
4. **No daily budget caps** per device or global per service. No referral system. No regional pricing.

**What's already cheap/safe (keep free):** 1:1 audio + captions runs on PeerJS (P2P, ~free), translation cascades Google→MyMemory free tiers before Claude Haiku (~0.02¢/call), TTS falls back to browser `speechSynthesis`. The free core loop costs ≈ nothing *if* the premium rails are gated.

## The iOS strategy call (important)

**Launch with: web pays, iOS stays free-looking.** The app already passed review exactly this way — the shell shows no prices and sells nothing; features simply follow the signed-in account's plan (the shell loads the live site, so a web-subscribed Pro user gets Pro inside the app automatically). This is the classic Spotify/Netflix model and it is compliant *because the app never mentions purchases*. **Do not add purchase links or trial copy to the native UA** — `verify-iap-gate.mjs` must keep passing.

StoreKit/RevenueCat IAP is **Phase 4, post-revenue** — it lifts iOS conversion but costs a native build, a new review round, and 15–30% Apple commission. Not a launch blocker.

## Target model (locked unless Phil overrides)

| | Free (forever) | Premium — 7-day full trial, then $5.99/mo or $39.99/yr |
|---|---|---|
| 1:1 audio calls + live translated captions | **Unlimited** | Unlimited |
| Video calls (Daily rail) | 10 min/month | Unlimited |
| Group calls | join always free; host 1 room/day | Unlimited hosting |
| Voice output | Browser TTS | ElevenLabs natural voices + **Voice Mimic** |
| Wingman/Cyrano | 10/month | Unlimited |
| AI call summaries + Learning Mode | 3/month | Unlimited |
| Language OS practice | 10 msgs/day | Unlimited |

**Callee is always free** — receiving a call never hits a gate (growth loop).
Referral: both sides get **+7 days Premium** when an invited contact completes a first call (cap 90 days/yr).

## Phases

### Phase 0 — Stop the bleeding + align tiers (ship first, ~1 day)
1. `lib/usage.ts`: new limits per the table; keep `translate: Infinity`.
2. **Gate the money routes** (server-side, by account plan OR device-id for anon):
   - `/api/daily/room`: plan/budget check before room creation; meter minutes into `daily_usage.video_minutes` (token TTL ↓ from 4h to 90min).
   - `/api/voice-clone`: Pro/trial only. `/api/voice-dub` + `/api/language-os/tts`: per-device daily char budget (e.g. 10k), then 402-style response → client already falls back to browser TTS.
   - `/api/transcribe`: per-device daily audio-minute cap (e.g. 20 min) → client falls back to Web Speech path.
   - Claude routes: shared per-device daily call budget (cheap, but principle).
3. **Redis-back every limiter** — standardize all routes on `lib/rate-limit.ts` + confirm `UPSTASH_REDIS_REST_URL/TOKEN` set in Vercel.
4. **Global kill-switch**: per-service daily spend counters (Supabase `service_budget`); on breach, route returns fallback-mode so the app degrades to the free rails instead of spending.
5. Link `deviceId ↔ user_id` at login/signup (needed for anon limits + referral attribution).

### Phase 1 — Pricing + conversion UX (~1–2 days)
1. Stripe: new Price objects $5.99/mo + $39.99/yr (keep $12.99 price for any existing subs); update `PricingContent.tsx`.
2. Upgrade-moment modal (web UA only): fires when a gate is hit ("You've used your 10 free video minutes…"). Trial countdown banner on dashboard.
3. Post-call share card ("You just had a 12-minute conversation across two languages") — the viral artifact.

### Phase 2 — Referral engine (~1 day)
`invites` table already records inviter/claimer. On claimed invite + first completed call: extend both accounts' `trial_ends_at`/`plan_expires_at` +7 days via a `referral_credits` table (idempotent, capped).

### Phase 3 — Go live (holiday corridor)
1. App Store availability: **needs Phil's country list** → Set Up Availability (app is approved & waiting).
2. Soft launch ~2 weeks: watch `service_budget` + conversion; fix friction.
3. Mid-Nov → Jan: "Llama a tu abuela" content push (mixed-language families, intercultural couples; Thanksgiving → Novenas Dec 16–24 → Christmas → New Year).

### Phase 4 — iOS IAP (post-revenue, optional)
RevenueCat + StoreKit 2, subscription group "Entrevoz Premium", submit with new app version. Only when web revenue proves the funnel.

## Decisions — LOCKED 2026-10-15
1. ✅ Price: $5.99/mo + $39.99/yr (shipped in UI/checkout; Stripe Price objects pending key).
2. ✅ App Store: ALL 175 territories — availability set, "Processing to Available".
3. ✅ Free video minutes: 10/month (enforced server-side).

## Status
- **Phase 0: SHIPPED** (commit 54d3de1) — all money routes gated, per-identity daily
  budgets + global kill-switches (Redis), video minutes metered with hard token-expiry
  cap, device↔account linking, launch limits, $5.99/$39.99 pricing UI.
- **BLOCKER for payments (Phil):** create a Stripe account/get the secret key, then:
  Stripe dashboard → Products → create "Entrevoz Premium" with two prices
  ($5.99/mo, $39.99/yr, both with 7-day trial allowed); add to Vercel env:
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (webhook → https://www.entrevoz.co/api/stripe/webhook,
  events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted),
  `STRIPE_PRICE_PRO_MONTHLY`, `STRIPE_PRICE_PRO_YEARLY`. Until then: trials work, checkout 503s.
- Next: Phase 1 (upgrade-moment modal, trial countdown, share card) → Phase 2 (referral credits).

## Worst-case cost per free user per day with Phase 0 caps
Whisper 20 min ≈ $0.12 · TTS 10k chars ≈ $0.15 (only if ElevenLabs left on for free tier — default: browser TTS = $0) · Claude ≈ $0.01 · video 10 min/mo ≈ $0.04/mo · TURN relay ≈ pennies. **Bounded by design; global kill-switch behind it.**
