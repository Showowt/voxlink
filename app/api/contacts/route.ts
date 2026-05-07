import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/contacts?deviceId=xxx
export async function GET(req: NextRequest) {
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
      await supabase
        .from("contacts")
        .update({
          call_count: (existing.call_count || 0) + 1,
          last_called_at: new Date().toISOString(),
          display_name: displayName || undefined,
          language: language || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("contacts").insert({
        owner_device_id: ownerDeviceId,
        contact_device_id: contactDeviceId,
        display_name: displayName || "Unknown",
        language: language || "en",
        call_count: 1,
        last_called_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Contacts POST]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// PATCH /api/contacts — toggle favorite
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { ownerDeviceId, contactDeviceId, isFavorite } = body;

    if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "ownerDeviceId is required and must be a string" }, { status: 400 });
    }
    if (!contactDeviceId || typeof contactDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "contactDeviceId is required and must be a string" }, { status: 400 });
    }

    await supabase
      .from("contacts")
      .update({ is_favorite: isFavorite, updated_at: new Date().toISOString() })
      .eq("owner_device_id", ownerDeviceId)
      .eq("contact_device_id", contactDeviceId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Contacts PATCH]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// DELETE /api/contacts — remove a contact
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { ownerDeviceId, contactDeviceId } = body;

    if (!ownerDeviceId || typeof ownerDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "ownerDeviceId is required and must be a string" }, { status: 400 });
    }
    if (!contactDeviceId || typeof contactDeviceId !== "string") {
      return NextResponse.json({ success: false, error: "contactDeviceId is required and must be a string" }, { status: 400 });
    }

    await supabase
      .from("contacts")
      .delete()
      .eq("owner_device_id", ownerDeviceId)
      .eq("contact_device_id", contactDeviceId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Contacts DELETE]", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
