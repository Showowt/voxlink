import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/proximity/presence - Remove user presence on app close
// ═══════════════════════════════════════════════════════════════════════════════

const DeletePresenceSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
});

export async function DELETE(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validated = DeletePresenceSchema.parse(searchParams);

    // Delete presence record
    const { error: deleteError } = await supabase
      .from("proximity_presence")
      .delete()
      .eq("session_id", validated.sessionId);

    if (deleteError) {
      console.error("Delete presence error:", deleteError);
      return NextResponse.json(
        { success: false, error: "Failed to remove presence" },
        { status: 500 },
      );
    }

    // Cancel any pending requests from this user
    const { error: cancelError } = await supabase
      .from("proximity_requests")
      .update({ status: "expired" })
      .eq("from_session_id", validated.sessionId)
      .eq("status", "pending");

    if (cancelError) {
      console.error("Cancel requests error:", cancelError);
    }

    return NextResponse.json({
      success: true,
      message: "Presence removed successfully",
    });
  } catch (error) {
    console.error("Delete presence endpoint error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/proximity/presence - Get current presence status
// ═══════════════════════════════════════════════════════════════════════════════

const GetPresenceSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
});

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validated = GetPresenceSchema.parse(searchParams);

    // Get presence record
    const { data, error } = await supabase
      .from("proximity_presence")
      .select("*")
      .eq("session_id", validated.sessionId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: "Presence not found" },
        { status: 404 },
      );
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: "Presence expired" },
        { status: 410 },
      );
    }

    return NextResponse.json({
      success: true,
      presence: {
        id: data.id,
        session_id: data.session_id,
        language: data.language,
        lat: data.lat,
        lng: data.lng,
        status: data.status,
        created_at: data.created_at,
        expires_at: data.expires_at,
        last_heartbeat: data.last_heartbeat,
      },
    });
  } catch (error) {
    console.error("Get presence endpoint error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
          details: error.issues,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH /api/proximity/presence - Update presence status (e.g., in_call -> available)
// ═══════════════════════════════════════════════════════════════════════════════

const UpdatePresenceSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
  status: z.enum(["available", "busy", "in_call"]),
});

export async function PATCH(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = UpdatePresenceSchema.parse(body);

    // Update presence status
    const { data, error } = await supabase
      .from("proximity_presence")
      .update({
        status: validated.status,
        last_heartbeat: new Date().toISOString(),
      })
      .eq("session_id", validated.sessionId)
      .select()
      .single();

    if (error || !data) {
      console.error("Update presence error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to update presence status" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      status: data.status,
      message: "Presence status updated successfully",
    });
  } catch (error) {
    console.error("Update presence endpoint error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid input", details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
