// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE CLIENT - Server-side payment processing singleton
// ═══════════════════════════════════════════════════════════════════════════════

import Stripe from "stripe";

// Lazy-loaded singleton to prevent build-time errors
let _stripe: Stripe | null = null;

function getStripeClient(): Stripe {
  if (_stripe) return _stripe;

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "[Stripe] STRIPE_SECRET_KEY not configured. Add it to environment variables.",
    );
  }

  _stripe = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });

  return _stripe;
}

// Export as getter for lazy initialization (prevents build-time errors)
export const stripe = new Proxy({} as Stripe, {
  get(_, prop: keyof Stripe) {
    const client = getStripeClient();
    const value = client[prop];
    // Bind methods to the client instance
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

// Check if Stripe is configured
export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// Safe getter that returns null if not configured (for API routes with graceful fallback)
export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;

  if (_stripe) return _stripe;

  _stripe = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });

  return _stripe;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRICE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

export const STRIPE_PRICES = {
  PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
} as const;

export const SUBSCRIPTION_TIERS = {
  FREE: "free",
  PRO: "pro",
} as const;

export type SubscriptionTier =
  (typeof SUBSCRIPTION_TIERS)[keyof typeof SUBSCRIPTION_TIERS];

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface SubscriptionRecord {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: Stripe.Subscription.Status;
  tier: SubscriptionTier;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}
