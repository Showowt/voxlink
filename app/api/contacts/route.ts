import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Placeholder names peers announce when no real name is set — never persist one
// of these over a real saved name (which would rename "María" to "User").
const SENTINEL_NAMES = new Set(["", "user", "partner", "unknown", "someone"]);
function meaningfulName(n: unknown): string | null {
  if (typeof n !== "string") return null;
  const t = n.trim();
  return t && !SENTINEL_NAMES.has(t.toLowerCase()) ? t.slice(0, 60) : null;
}

const limiter = new Map<string, { count: number; reset: number }>();
function checkLimit(ip: string, max: number): boolean {
  const now = Date.now();
  const e = limiter.get(ip);
  if (!e || now > e.reset) {
    limiter.set(ip, { count: 1, reset: now + 60000 });
    return true;
  }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

// GET /api/contacts?deviceId=xxx
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip, 60)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId) {
    return NextResponse.json({ contacts: [] });
  }

  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("owner_device_id", deviceId)
    .order("is_favorite", { ascending: false })
    .order("last_called_at", { ascending: false });

  if (error) {
    console.error("[Contacts GET]", error);
    return NextResponse.json({ contacts: [] });
  }

  return NextResponse.json({ contacts: data || [] });
}

// POST /api/contacts — upsert a contact after a call
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip, 60)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { ownerDeviceId, contactDeviceId, displayName, language } = body;

    // Never report a fake success: if storage is unconfigured the no-op client
    // resolves {data:null,error:null}, which would look like a successful save.
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: "Storage not configured" }, { status: 503 });
    }

    if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "ownerDeviceId is required and must be a string" }, { status: 400 });
    }
    if (!contactDeviceId || typeof contactDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "contactDeviceId is required and must be a string" }, { status: 400 });
    }
    if (ownerDeviceId === contactDeviceId) {
      return NextResponse.json({ success: false, error: "ownerDeviceId and contactDeviceId must be different" }, { status: 400 });
    }
    if (displayName !== undefined && typeof displayName !== "string") {
      return NextResponse.json({ success: false, error: "displayName must be a string" }, { status: 400 });
    }
    if (language !== undefined && typeof language !== "string") {
      return NextResponse.json({ success: false, error: "language must be a string" }, { status: 400 });
    }

    // Try to update existing contact (increment call count). maybeSingle avoids
    // a noisy error when there's no existing row; the unique index on
    // (owner_device_id, contact_device_id) guarantees at most one match.
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, call_count")
      .eq("owner_device_id", ownerDeviceId)
      .eq("contact_device_id", contactDeviceId)
      .maybeSingle();

    if (existing) {
      // Only bump call metadata + upgrade the name when we actually have a real
      // one. Never overwrite a saved name/language with a placeholder ("User")
      // or a fallback ("en"), which happens on nearly every re-call.
      const patch: Record<string, unknown> = {
        call_count: (existing.call_count || 0) + 1,
        last_called_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const goodName = meaningfulName(displayName);
      if (goodName) patch.display_name = goodName;

      const { error: updateError } = await supabase
        .from("contacts")
        .update(patch)
        .eq("id", existing.id);

      if (updateError) {
        console.error("[Contacts POST] Update error:", updateError);
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabase.from("contacts").insert({
        owner_device_id: ownerDeviceId,
        contact_device_id: contactDeviceId,
        display_name: meaningfulName(displayName) || "Unknown",
        language: language || "en",
        call_count: 1,
        last_called_at: new Date().toISOString(),
      });

      if (insertError) {
        // A concurrent save may have created the row first (unique-index race) —
        // the contact exists, which was the goal, so treat it as success.
        if (insertError.code === "23505") {
          return NextResponse.json({ success: true });
        }
        console.error("[Contacts POST] Insert error:", insertError);
        return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Contacts POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// PATCH /api/contacts — toggle favorite
export async function PATCH(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip, 60)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { ownerDeviceId, contactDeviceId, isFavorite, displayName } = body;

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: "Storage not configured" }, { status: 503 });
    }

    if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "ownerDeviceId is required and must be a string" }, { status: 400 });
    }
    if (!contactDeviceId || typeof contactDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "contactDeviceId is required and must be a string" }, { status: 400 });
    }
    if (displayName !== undefined && typeof displayName !== "string") {
      return NextResponse.json({ success: false, error: "displayName must be a string" }, { status: 400 });
    }

    // Build a partial update so a rename doesn't wipe the favorite flag (and
    // vice-versa).
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (isFavorite !== undefined) patch.is_favorite = isFavorite;
    if (typeof displayName === "string" && displayName.trim()) {
      patch.display_name = displayName.trim().slice(0, 60);
    }
    // Late language upgrade: the real language often arrives via the in-call
    // handshake AFTER the contact was first saved.
    const { language } = body as { language?: unknown };
    if (typeof language === "string" && /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(language)) {
      patch.language = language;
    }

    const { error: updateError } = await supabase
      .from("contacts")
      .update(patch)
      .eq("owner_device_id", ownerDeviceId)
      .eq("contact_device_id", contactDeviceId);

    if (updateError) {
      console.error("[Contacts PATCH] Update error:", updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Contacts PATCH]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// DELETE /api/contacts — remove a contact
export async function DELETE(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip, 60)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { ownerDeviceId, contactDeviceId } = body;

    if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "ownerDeviceId is required and must be a string" }, { status: 400 });
    }
    if (!contactDeviceId || typeof contactDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "contactDeviceId is required and must be a string" }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from("contacts")
      .delete()
      .eq("owner_device_id", ownerDeviceId)
      .eq("contact_device_id", contactDeviceId);

    if (deleteError) {
      console.error("[Contacts DELETE] Delete error:", deleteError);
      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Contacts DELETE]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
