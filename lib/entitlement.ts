// ═══════════════════════════════════════════════════════════════════════════════
// ENTITLEMENT — single source of truth for "is this request Premium?"
// Server-only. Reads profiles (the table the Stripe webhook actually writes;
// the legacy `subscriptions` table was never created in this project).
//
// Identity resolution: prefer an explicit userId; otherwise map a deviceId to
// its linked account via device_accounts (populated at sign-in). Anonymous
// device with no link = free tier.
//
// Premium = active paid plan (plan in pro/enterprise, not expired) OR an
// unexpired signup trial (trial_ends_at in the future). The 7-day trial is
// granted at signup by the profiles schema default, so trials work even
// before Stripe keys are configured.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from "./supabase-admin";

export interface Entitlement {
  entitled: boolean; // premium features unlocked (paid or trialing)
  plan: "free" | "pro" | "enterprise";
  trialing: boolean;
  userId: string | null;
}

const FREE: Entitlement = { entitled: false, plan: "free", trialing: false, userId: null };

// Tiny TTL cache — entitlement is checked on hot call paths; don't hit
// Postgres on every caption. 60s staleness on plan changes is fine.
const cache = new Map<string, { value: Entitlement; expires: number }>();
const CACHE_MS = 60_000;

function uuidish(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f-]{32,40}$/i.test(s);
}

// Founder/tester devices: full entitlement without an account. Comma-separated
// device ids in PREMIUM_DEVICE_IDS (Vercel env). Keeps the team and App Review
// from being throttled by the free-tier caps they're supposed to be testing.
function premiumDeviceAllowlist(): Set<string> {
  return new Set(
    (process.env.PREMIUM_DEVICE_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length >= 8),
  );
}

export async function getEntitlement(opts: {
  userId?: string | null;
  deviceId?: string | null;
}): Promise<Entitlement> {
  if (opts.deviceId && premiumDeviceAllowlist().has(opts.deviceId)) {
    return { entitled: true, plan: "pro", trialing: false, userId: null };
  }
  const admin = supabaseAdmin();
  if (!admin) return FREE;

  const cacheKey = `${opts.userId || ""}|${opts.deviceId || ""}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  let userId: string | null = uuidish(opts.userId) ? opts.userId : null;

  try {
    if (!userId && typeof opts.deviceId === "string" && opts.deviceId.length >= 8) {
      const { data } = await admin
        .from("device_accounts")
        .select("user_id")
        .eq("device_id", opts.deviceId)
        .maybeSingle();
      userId = (data?.user_id as string) || null;
    }

    if (!userId) {
      cache.set(cacheKey, { value: FREE, expires: Date.now() + CACHE_MS });
      return FREE;
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("plan, plan_expires_at, trial_ends_at")
      .eq("id", userId)
      .maybeSingle();

    const now = Date.now();
    const plan = (profile?.plan as Entitlement["plan"]) || "free";
    const planActive =
      (plan === "pro" || plan === "enterprise") &&
      (!profile?.plan_expires_at || new Date(profile.plan_expires_at).getTime() > now);
    const trialing =
      !planActive &&
      !!profile?.trial_ends_at &&
      new Date(profile.trial_ends_at).getTime() > now;

    const value: Entitlement = {
      entitled: planActive || trialing,
      plan: planActive ? plan : "free",
      trialing,
      userId,
    };
    cache.set(cacheKey, { value, expires: now + CACHE_MS });
    return value;
  } catch (err) {
    console.error("[Entitlement]", err);
    return FREE;
  }
}
