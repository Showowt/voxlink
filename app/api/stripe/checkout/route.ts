import { NextRequest, NextResponse } from "next/server";
import { getStripe, STRIPE_PRICES } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase-auth";

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE CHECKOUT API - Create checkout session for Pro subscription
// POST - Creates Stripe checkout session with authenticated user
// Returns: { url: string } for redirect to Stripe
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_PLANS = ["pro", "enterprise"] as const;
type ValidPlan = (typeof VALID_PLANS)[number];

const limiter = new Map<string, { count: number; reset: number }>();
function checkLimit(ip: string): boolean {
  const now = Date.now();
  const e = limiter.get(ip);
  if (!e || now > e.reset) {
    limiter.set(ip, { count: 1, reset: now + 60000 });
    return true;
  }
  if (e.count >= 20) return false;
  e.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? req.ip ?? "unknown";
  if (!checkLimit(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeClient = getStripe();
  if (!stripeClient) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 },
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, email, display_name")
    .eq("id", user.id)
    .single();

  try {
    const body = await req.json();
    const plan = body.plan;

    if (!plan || typeof plan !== "string" || !VALID_PLANS.includes(plan as ValidPlan)) {
      return NextResponse.json(
        { error: "Invalid plan. Must be one of: " + VALID_PLANS.join(", ") },
        { status: 400 },
      );
    }

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripeClient.customers.create({
        email: profile?.email ?? user.email,
        name: profile?.display_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const interval = body?.interval === "year" ? "year" : "month";
    const priceId =
      plan === "pro"
        ? interval === "year"
          ? STRIPE_PRICES.PRO_YEARLY
          : STRIPE_PRICES.PRO_MONTHLY
        : null;

    if (!priceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // trim(): the env var once shipped with a literal trailing "\n", which made
    // Stripe reject success_url as "Not a valid URL" and 500 every checkout.
    const appUrl =
      (process.env.NEXT_PUBLIC_APP_URL || "https://www.entrevoz.co").trim();

    // Trial only for FIRST-TIME subscribers — unconditional trial_period_days
    // was an infinite-free-Pro loop (cancel, resubscribe, repeat).
    let hadSubscription = false;
    try {
      const prior = await stripeClient.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 1,
      });
      hadSubscription = prior.data.length > 0;
    } catch {
      /* on doubt, grant the trial — kinder failure mode */
    }

    const session = await stripeClient.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/pricing`,
      subscription_data: {
        ...(hadSubscription ? {} : { trial_period_days: 7 }),
        metadata: { supabase_user_id: user.id, plan },
      },
      metadata: { supabase_user_id: user.id, plan },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[Stripe Checkout]", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
