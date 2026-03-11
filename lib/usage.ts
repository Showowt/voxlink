// ═══════════════════════════════════════════════════════════════════════════════
// USAGE TRACKING SERVICE - Enforces free tier limits for Voxxo features
// Tracks usage per user (authenticated) or session (anonymous)
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase, isSupabaseConfigured } from "./supabase";
import type { SubscriptionTier } from "./stripe";

// ─── Feature Types ────────────────────────────────────────────────────────────
export type Feature = "wingman" | "video_call" | "proximity" | "translate";

export interface UsageLimits {
  wingman: number; // 10 for free, unlimited for pro
  video_call: number; // 0 for free, unlimited for pro
  proximity: number; // 0 for free, unlimited for pro
  translate: number; // unlimited for all
}

// ─── Tier Limits ──────────────────────────────────────────────────────────────
export const FREE_LIMITS: UsageLimits = {
  wingman: 10,
  video_call: 0, // Not available on free tier
  proximity: 0, // Not available on free tier
  translate: Infinity, // Always unlimited
};

export const PRO_LIMITS: UsageLimits = {
  wingman: Infinity,
  video_call: Infinity,
  proximity: Infinity,
  translate: Infinity,
};

export const ENTERPRISE_LIMITS: UsageLimits = {
  wingman: Infinity,
  video_call: Infinity,
  proximity: Infinity,
  translate: Infinity,
};

// ─── Usage Result Types ───────────────────────────────────────────────────────
export interface UsageCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  used: number;
  plan: "free" | "pro" | "enterprise";
  periodEnds: string; // ISO date when current period resets
}

export interface TrackResult {
  success: boolean;
  remaining: number;
  error?: string;
}

// ─── In-Memory Fallback ───────────────────────────────────────────────────────
// Used when Supabase is not configured (development without DB)
const memoryUsage = new Map<
  string,
  { count: number; periodStart: number; periodEnd: number }
>();

function getMemoryKey(feature: Feature, identifier: string): string {
  return `${feature}:${identifier}`;
}

// Get the start and end of the current billing period (monthly, starting from day 1)
function getCurrentPeriod(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

// ─── Get User's Subscription Plan ─────────────────────────────────────────────
export async function getUserPlan(
  userId?: string,
): Promise<"free" | "pro" | "enterprise"> {
  // No user ID = anonymous = free tier
  if (!userId) {
    return "free";
  }

  // Supabase not configured = assume free
  if (!isSupabaseConfigured()) {
    return "free";
  }

  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      console.error("[Usage] Error fetching subscription:", error);
      return "free";
    }

    if (!data) {
      return "free";
    }

    // Map subscription tier to plan
    const tier = data.tier as SubscriptionTier;
    if (tier === "pro") return "pro";

    return "free";
  } catch (err) {
    console.error("[Usage] Exception fetching subscription:", err);
    return "free";
  }
}

// ─── Get Limits for Plan ──────────────────────────────────────────────────────
function getLimitsForPlan(plan: "free" | "pro" | "enterprise"): UsageLimits {
  switch (plan) {
    case "pro":
      return PRO_LIMITS;
    case "enterprise":
      return ENTERPRISE_LIMITS;
    default:
      return FREE_LIMITS;
  }
}

// ─── Track Feature Usage ──────────────────────────────────────────────────────
export async function trackUsage(
  feature: Feature,
  userId?: string,
  sessionId?: string,
): Promise<void> {
  const identifier = userId || sessionId;

  if (!identifier) {
    console.warn("[Usage] No identifier provided for tracking");
    return;
  }

  const { start, end } = getCurrentPeriod();

  // Use Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      await supabase.from("feature_usage").insert({
        feature,
        user_id: userId || null,
        session_id: sessionId || null,
        used_at: new Date().toISOString(),
        period_start: start.toISOString(),
        period_end: end.toISOString(),
      });
    } catch (err) {
      console.error("[Usage] Failed to track usage:", err);
    }
    return;
  }

  // Fallback to in-memory tracking
  const key = getMemoryKey(feature, identifier);
  const existing = memoryUsage.get(key);
  const now = Date.now();

  if (existing && now >= existing.periodStart && now < existing.periodEnd) {
    // Within current period, increment
    existing.count++;
  } else {
    // New period or first use
    memoryUsage.set(key, {
      count: 1,
      periodStart: start.getTime(),
      periodEnd: end.getTime(),
    });
  }

  // Cleanup old entries
  if (memoryUsage.size > 1000) {
    Array.from(memoryUsage.entries()).forEach(([k, v]) => {
      if (now >= v.periodEnd) {
        memoryUsage.delete(k);
      }
    });
  }
}

// ─── Get Current Usage Count ──────────────────────────────────────────────────
export async function getUsage(
  feature: Feature,
  userId?: string,
  sessionId?: string,
): Promise<number> {
  const identifier = userId || sessionId;

  if (!identifier) {
    return 0;
  }

  const { start, end } = getCurrentPeriod();

  // Use Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      // Build query - match either user_id OR session_id
      let query = supabase
        .from("feature_usage")
        .select("id", { count: "exact", head: true })
        .eq("feature", feature)
        .gte("used_at", start.toISOString())
        .lt("used_at", end.toISOString());

      if (userId) {
        query = query.eq("user_id", userId);
      } else if (sessionId) {
        query = query.eq("session_id", sessionId);
      }

      const { count, error } = await query;

      if (error) {
        console.error("[Usage] Error fetching usage:", error);
        return 0;
      }

      return count || 0;
    } catch (err) {
      console.error("[Usage] Exception fetching usage:", err);
      return 0;
    }
  }

  // Fallback to in-memory
  const key = getMemoryKey(feature, identifier);
  const existing = memoryUsage.get(key);
  const now = Date.now();

  if (existing && now >= existing.periodStart && now < existing.periodEnd) {
    return existing.count;
  }

  return 0;
}

// ─── Check if Feature Can Be Used ─────────────────────────────────────────────
export async function canUseFeature(
  feature: Feature,
  userId?: string,
  sessionId?: string,
): Promise<UsageCheckResult> {
  const { end } = getCurrentPeriod();

  // Get user's plan
  const plan = await getUserPlan(userId);
  const limits = getLimitsForPlan(plan);
  const limit = limits[feature];

  // Unlimited features (translate for all, everything for pro/enterprise)
  if (limit === Infinity) {
    return {
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      used: 0, // Don't bother counting for unlimited
      plan,
      periodEnds: end.toISOString(),
    };
  }

  // Feature not available on this plan (limit = 0)
  if (limit === 0) {
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      used: 0,
      plan,
      periodEnds: end.toISOString(),
    };
  }

  // Count current usage
  const used = await getUsage(feature, userId, sessionId);
  const remaining = Math.max(0, limit - used);
  const allowed = used < limit;

  return {
    allowed,
    remaining,
    limit,
    used,
    plan,
    periodEnds: end.toISOString(),
  };
}

// ─── Convenience: Check and Track in One Call ────────────────────────────────
export async function useFeature(
  feature: Feature,
  userId?: string,
  sessionId?: string,
): Promise<TrackResult> {
  const check = await canUseFeature(feature, userId, sessionId);

  if (!check.allowed) {
    return {
      success: false,
      remaining: check.remaining,
      error:
        check.limit === 0
          ? `${feature} is not available on the free plan. Upgrade to Pro to unlock this feature.`
          : `You've reached your monthly limit of ${check.limit} ${feature} uses. Upgrade to Pro for unlimited access.`,
    };
  }

  // Track the usage
  await trackUsage(feature, userId, sessionId);

  return {
    success: true,
    remaining: check.remaining - 1, // Account for this use
  };
}
