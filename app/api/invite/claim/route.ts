import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { deriveDialCode } from "@/app/lib/dial-code";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// INVITE CLAIM — the "attach" moment.
// First time the invitee opens the invite (no account needed), this: marks the
// invite claimed, creates BOTH contact rows (inviter ↔ invitee, using the
// inviter's chosen label), and registers the invitee in the dial directory so
// they're instantly callable/saveable by code. Idempotent for the same device.
// ─────────────────────────────────────────────────────────────────────────────

const SENTINELS = new Set(["", "user", "partner", "unknown", "someone"]);
const goodName = (n: unknown): string | null => {
  if (typeof n !== "string") return null;
  const t = n.trim();
  return t && !SENTINELS.has(t.toLowerCase()) ? t.slice(0, 60) : null;
};

// Insert a contact if the pair doesn't exist; if it does, only upgrade the name
// when we have a meaningful one (never resets call_count or clobbers names).
async function ensureContact(
  owner: string,
  contact: string,
  displayName: string | null,
  language: string,
) {
  if (!owner || !contact || owner === contact) return;
  const { data: existing } = await supabase
    .from("contacts")
    .select("id")
    .eq("owner_device_id", owner)
    .eq("contact_device_id", contact)
    .maybeSingle();
  if (existing) {
    if (displayName) {
      await supabase
        .from("contacts")
        .update({ display_name: displayName, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return;
  }
  const { error } = await supabase.from("contacts").insert({
    owner_device_id: owner,
    contact_device_id: contact,
    display_name: displayName || "Unknown",
    language,
    call_count: 0,
    last_called_at: new Date().toISOString(),
  });
  // Unique-index race with a concurrent save = the contact exists; fine.
  if (error && error.code !== "23505") {
    console.error("[invite claim] contact insert:", error.message);
  }
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`invclaim:${ip}`, 30, 60000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
    }
    const { inviteCode, deviceId, name, lang } = await req.json();
    if (!inviteCode || typeof inviteCode !== "string") {
      return NextResponse.json({ error: "inviteCode required" }, { status: 400 });
    }
    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json({ error: "deviceId required" }, { status: 400 });
    }
    const code = inviteCode.toUpperCase().slice(0, 12);

    const { data: invite } = await supabase
      .from("invites")
      .select("*")
      .eq("invite_code", code)
      .maybeSingle();

    if (!invite) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (invite.inviter_device_id === deviceId) {
      return NextResponse.json({ error: "own_invite" }, { status: 400 });
    }
    if (invite.claimed_by_device_id && invite.claimed_by_device_id !== deviceId) {
      return NextResponse.json({ error: "already_claimed" }, { status: 409 });
    }

    const claimedName = goodName(name);
    const inviteeLang = typeof lang === "string" && lang ? lang.slice(0, 8) : "en";

    // Mark claimed (idempotent re-claim by the same device just refreshes).
    await supabase
      .from("invites")
      .update({
        claimed_by_device_id: deviceId,
        claimed_name: claimedName,
        claimed_at: invite.claimed_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("invite_code", code);

    // Two-way contacts. The inviter's label for this person WINS on their side.
    await ensureContact(
      invite.inviter_device_id,
      deviceId,
      goodName(invite.invitee_label) || claimedName,
      inviteeLang,
    );
    await ensureContact(
      deviceId,
      invite.inviter_device_id,
      goodName(invite.inviter_name),
      invite.inviter_lang || "en",
    );

    // Register the invitee in the dial directory — instantly callable by code.
    await supabase.from("dial_directory").upsert(
      {
        device_id: deviceId,
        dial_code: deriveDialCode(deviceId),
        display_name: claimedName,
        language: inviteeLang,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" },
    );

    return NextResponse.json({
      success: true,
      // True only on the FIRST claim — the client uses this to fire the
      // "X just joined" live signal to the inviter exactly once.
      firstClaim: !invite.claimed_at,
      inviter: {
        deviceId: invite.inviter_device_id,
        name: goodName(invite.inviter_name) || "Your friend",
        lang: invite.inviter_lang || "en",
      },
      yourCode: deriveDialCode(deviceId),
    });
  } catch (e) {
    console.error("[invite claim]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
