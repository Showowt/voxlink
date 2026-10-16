import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Hourly cleanup of the high-churn telemetry/ring tables so they don't grow
// unbounded. ring_invites are only useful for ~60s; diag_events for debugging
// a few days. Vercel cron auto-authenticates; a stray public hit just no-ops
// the same safe deletes.
export async function GET() {
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 503 });

  const ringCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const diagCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    await admin.from("ring_invites").delete().lt("created_at", ringCutoff);
    await admin.from("diag_events").delete().lt("created_at", diagCutoff);
  } catch (e) {
    console.error("[ring-cleanup]", e);
  }
  return NextResponse.json({ ok: true });
}
