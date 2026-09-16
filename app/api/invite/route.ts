import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// INVITES
// A labeled, claimable link: creating one instantly shows a pending contact in
// the inviter's list; the moment the invitee opens it (no account needed —
// device id is the identity), both sides become real contacts and can call.
// ─────────────────────────────────────────────────────────────────────────────

// Same unambiguous alphabet as dial codes — safe to read aloud.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
function newInviteCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// POST /api/invite — create an invite (pending contact for the inviter).
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`inv:${ip}`, 30, 60000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
    }
    const { deviceId, inviterName, inviterLang, inviteeLabel } = await req.json();
    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }

    const inviteCode = newInviteCode();
    const { error } = await supabase.from("invites").insert({
      invite_code: inviteCode,
      inviter_device_id: deviceId,
      inviter_name:
        typeof inviterName === "string" && inviterName.trim()
          ? inviterName.trim().slice(0, 60)
          : null,
      inviter_lang:
        typeof inviterLang === "string" && inviterLang ? inviterLang.slice(0, 8) : "en",
      invitee_label:
        typeof inviteeLabel === "string" && inviteeLabel.trim()
          ? inviteeLabel.trim().slice(0, 60)
          : null,
    });

    if (error) {
      console.error("[invite POST]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, inviteCode });
  } catch (e) {
    console.error("[invite POST]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// GET /api/invite?code=XXXX          → public invite info (for the landing page)
// GET /api/invite?inviterDeviceId=x  → my invites (pending + claimed)
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`inv:${ip}`, 120, 60000);
  if (!rl.allowed) return NextResponse.json({ found: false }, { status: 429 });

  const code = (req.nextUrl.searchParams.get("code") || "").toUpperCase().slice(0, 12);
  if (code) {
    const { data } = await supabase
      .from("invites")
      .select("invite_code, inviter_device_id, inviter_name, inviter_lang, invitee_label, claimed_by_device_id")
      .eq("invite_code", code)
      .maybeSingle();
    if (!data) return NextResponse.json({ found: false });
    return NextResponse.json({
      found: true,
      inviteCode: data.invite_code,
      inviterName: data.inviter_name || "A friend",
      inviterLang: data.inviter_lang || "en",
      label: data.invitee_label || null,
      claimed: !!data.claimed_by_device_id,
      claimedBy: data.claimed_by_device_id || null,
    });
  }

  const inviter = req.nextUrl.searchParams.get("inviterDeviceId") || "";
  if (!inviter) return NextResponse.json({ invites: [] });
  const { data, error } = await supabase
    .from("invites")
    .select("invite_code, invitee_label, claimed_by_device_id, claimed_name, created_at, claimed_at")
    .eq("inviter_device_id", inviter)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ invites: [] });
  return NextResponse.json({ invites: data || [] });
}

// DELETE /api/invite — cancel a pending invite (inviter only).
export async function DELETE(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`inv:${ip}`, 30, 60000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  try {
    const { deviceId, inviteCode } = await req.json();
    if (!deviceId || !inviteCode) {
      return NextResponse.json({ error: "deviceId + inviteCode required" }, { status: 400 });
    }
    const { error } = await supabase
      .from("invites")
      .delete()
      .eq("invite_code", String(inviteCode).toUpperCase().slice(0, 12))
      .eq("inviter_device_id", deviceId)
      .is("claimed_by_device_id", null);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[invite DELETE]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
