import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createServerClient } from "@/lib/supabase-auth";

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE PORTAL API - Customer billing portal for subscription management
// POST - Creates Stripe customer portal session for authenticated user
// Returns: { url: string } for redirect to Stripe portal
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
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
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No subscription found" },
      { status: 404 },
    );
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://www.entrevoz.co";

  const session = await stripeClient.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/dashboard`,
  });

  return NextResponse.json({ url: session.url });
}
