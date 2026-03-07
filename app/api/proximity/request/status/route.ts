import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/proximity/request/status - Check status of a specific request
// Used by sender to know when their request was accepted/rejected
// ═══════════════════════════════════════════════════════════════════════════════

const StatusQuerySchema = z.object({
  requestId: z.string().uuid("Invalid request ID"),
});

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validated = StatusQuerySchema.parse(searchParams);

    // Get the request status
    const { data, error } = await supabase
      .from("proximity_requests")
      .select("id, status, room_code, responded_at, expires_at")
      .eq("id", validated.requestId)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: "Request not found" },
        { status: 404 },
      );
    }

    // Check if expired
    if (data.status === "pending" && new Date(data.expires_at) < new Date()) {
      // Update to expired
      await supabase
        .from("proximity_requests")
        .update({ status: "expired" })
        .eq("id", validated.requestId);

      return NextResponse.json({
        success: true,
        status: "expired",
        roomCode: null,
      });
    }

    return NextResponse.json({
      success: true,
      status: data.status,
      roomCode: data.room_code || null,
      respondedAt: data.responded_at || null,
    });
  } catch (error) {
    console.error("Request status error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request ID", details: error.issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
