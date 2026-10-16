// ═══════════════════════════════════════════════════════════════════════════════
// SPEND BUDGETS — the cost-control layer in front of every metered service.
// Two levels, both Redis-backed fixed 24h windows (reuses the rate limiter,
// so no new storage):
//
//   1. deviceBudget — per-identity daily allowance, sized by entitlement.
//      Free identities get a taste; premium gets generous-but-bounded.
//   2. serviceBudget — GLOBAL daily kill-switch per paid service. If the whole
//      app's spend on a service exceeds the cap (viral spike, abuse, a bug in
//      a loop), every route degrades to its free fallback instead of spending.
//
// Every cap is env-overridable so launch-day tuning needs no deploy.
// A denied budget is NOT an error for the user: callers must degrade
// (browser TTS, on-device speech, free translation tier) — never hard-fail.
// ═══════════════════════════════════════════════════════════════════════════════

import { checkRateLimit } from "./rate-limit";

const DAY_MS = 24 * 60 * 60 * 1000;

function envInt(name: string, fallback: number): number {
  const v = parseInt(process.env[name] || "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// ── Global per-service daily caps (requests/day across ALL users) ────────────
const SERVICE_CAPS: Record<string, () => number> = {
  elevenlabs: () => envInt("SVC_CAP_ELEVENLABS", 20_000), // TTS+clone calls/day ≈ <$100/day worst case
  whisper: () => envInt("SVC_CAP_WHISPER", 50_000), // ≤30s clips/day ≈ <$150/day worst case
  claude: () => envInt("SVC_CAP_CLAUDE", 100_000), // Haiku calls/day ≈ <$25/day
  daily: () => envInt("SVC_CAP_DAILY_ROOMS", 2_000), // video room-joins/day
};

/** Global kill-switch. True = service may spend; false = degrade to fallback. */
export async function serviceBudgetOk(
  service: keyof typeof SERVICE_CAPS,
): Promise<boolean> {
  try {
    const cap = SERVICE_CAPS[service]();
    const res = await checkRateLimit(`svcbudget:${service}`, cap, DAY_MS);
    if (!res.allowed) {
      console.error(`[Budget] GLOBAL ${service} daily cap (${cap}) reached — degrading to fallback`);
    }
    return res.allowed;
  } catch {
    return true; // budget infra failure must never take the product down
  }
}

// ── Per-identity daily allowances ─────────────────────────────────────────────
export interface BudgetResult {
  allowed: boolean;
  remaining: number;
}

/**
 * Charge one unit against an identity's daily budget for a metric.
 * identity = deviceId (preferred) or IP as last resort.
 */
export async function deviceBudget(
  metric: string,
  identity: string,
  entitled: boolean,
  freeLimit: number,
  premiumLimit: number,
): Promise<BudgetResult> {
  try {
    const limit = entitled ? premiumLimit : freeLimit;
    if (limit <= 0) return { allowed: false, remaining: 0 };
    const res = await checkRateLimit(`budget:${metric}:${identity}`, limit, DAY_MS);
    return { allowed: res.allowed, remaining: res.remaining };
  } catch {
    return { allowed: true, remaining: 1 };
  }
}

// Per-metric daily allowances (env-overridable). Units are REQUESTS unless noted.
export const DAILY_ALLOWANCES = {
  // ElevenLabs TTS (voice-dub + Language OS TTS, ≤500 chars/request).
  // Free gets a small daily taste so first-call demos keep their wow, then
  // the client falls back to browser TTS. FREE_DAILY_TTS=0 disables the taste.
  tts: () => ({
    free: envInt("FREE_DAILY_TTS", 10),
    premium: envInt("PREMIUM_DAILY_TTS", 2_000),
  }),
  // Whisper clips: the iOS LIVE-CALL loop sends ~1.2s clips (~50/min of
  // speech), not 30s ones — 60/day was ~70 SECONDS of captions for a free
  // user. Calibrated for ~30 min/day free, ~5h premium at live-loop rates.
  transcribe: () => ({
    free: envInt("FREE_DAILY_TRANSCRIBE", 1500),
    premium: envInt("PREMIUM_DAILY_TRANSCRIBE", 15000),
  }),
  // All Claude-backed helpers combined (coaching, insights, tone, summaries,
  // practice chat, translate's last-resort tier).
  claude: () => ({
    free: envInt("FREE_DAILY_CLAUDE", 300),
    premium: envInt("PREMIUM_DAILY_CLAUDE", 2_000),
  }),
};
