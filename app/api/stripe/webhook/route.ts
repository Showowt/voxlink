import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ═══════════════════════════════════════════════════════════════════════════════
// STRIPE WEBHOOK API - Handle subscription lifecycle events
// POST - Receives webhook events from Stripe
// Uses service role for direct database access (bypasses RLS)
// Handles: checkout.session.completed, customer.subscription.updated/deleted
// ═══════════════════════════════════════════════════════════════════════════════

const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia",
    })
  : null;

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      )
    : null;

export async function POST(req: NextRequest) {
  if (!stripeClient || !supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripeClient.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error("[Webhook] Invalid signature:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency check - skip duplicate events
  const { data: existing } = await supabase
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .single();

  if (existing) {
    return NextResponse.json({ received: true, skipped: true });
  }

  // Store event for idempotency
  await supabase.from("stripe_events").insert({
    id: event.id,
    type: event.type,
    data: event.data as unknown as Record<string, unknown>,
  });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      const plan = session.metadata?.plan as "pro" | "enterprise";
      if (!userId || !plan) break;

      const sub = await stripeClient.subscriptions.retrieve(
        session.subscription as string,
      );
      const expiresAt = new Date(sub.current_period_end * 1000).toISOString();

      await supabase
        .from("profiles")
        .update({
          plan,
          plan_expires_at: expiresAt,
        })
        .eq("id", userId);

      console.log(`[Webhook] Plan ${plan} activated for ${userId}`);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) break;

      const plan = sub.metadata?.plan as "pro" | "enterprise" | undefined;
      const expiresAt = new Date(sub.current_period_end * 1000).toISOString();
      const isActive = ["active", "trialing"].includes(sub.status);

      await supabase
        .from("profiles")
        .update({
          plan: isActive ? (plan ?? "pro") : "free",
          plan_expires_at: isActive ? expiresAt : null,
        })
        .eq("id", userId);

      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.supabase_user_id;
      if (!userId) break;

      await supabase
        .from("profiles")
        .update({
          plan: "free",
          plan_expires_at: null,
        })
        .eq("id", userId);

      console.log(`[Webhook] Subscription cancelled for ${userId}`);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

export const dynamic = "force-dynamic";
