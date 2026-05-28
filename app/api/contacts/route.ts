import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

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

    // Try to update existing contact (increment call count)
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, call_count")
      .eq("owner_device_id", ownerDeviceId)
      .eq("contact_device_id", contactDeviceId)
      .single();

    if (existing) {
      const { error: updateError } = await supabase
        .from("contacts")
        .update({
          call_count: (existing.call_count || 0) + 1,
          last_called_at: new Date().toISOString(),
          display_name: displayName || undefined,
          language: language || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("[Contacts POST] Update error:", updateError);
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabase.from("contacts").insert({
        owner_device_id: ownerDeviceId,
        contact_device_id: contactDeviceId,
        display_name: displayName || "Unknown",
        language: language || "en",
        call_count: 1,
        last_called_at: new Date().toISOString(),
      });

      if (insertError) {
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
    const { ownerDeviceId, contactDeviceId, isFavorite } = body;

    if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "ownerDeviceId is required and must be a string" }, { status: 400 });
    }
    if (!contactDeviceId || typeof contactDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "contactDeviceId is required and must be a string" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("contacts")
      .update({ is_favorite: isFavorite, updated_at: new Date().toISOString() })
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
