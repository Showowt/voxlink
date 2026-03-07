import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { randomBytes } from "crypto";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/proximity/respond - Accept or reject a connection request
// ═══════════════════════════════════════════════════════════════════════════════

const RespondSchema = z.object({
  requestId: z.string().uuid("Invalid request ID"),
  accept: z.boolean(),
  sessionId: z.string().min(1, "Session ID required"), // Verify it's the recipient
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = RespondSchema.parse(body);

    // Get the connection request
    const { data: connectionRequest, error: fetchError } = await supabase
      .from("proximity_requests")
      .select("*")
      .eq("id", validated.requestId)
      .single();

    if (fetchError || !connectionRequest) {
      return NextResponse.json(
        { success: false, error: "Connection request not found" },
        { status: 404 },
      );
    }

    // Verify the user is the recipient
    if (connectionRequest.to_session_id !== validated.sessionId) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: You are not the recipient of this request",
        },
        { status: 403 },
      );
    }

    // Check if request is still pending
    if (connectionRequest.status !== "pending") {
      return NextResponse.json(
        {
          success: false,
          error: `Request already ${connectionRequest.status}`,
        },
        { status: 409 },
      );
    }

    // Check if request has expired
    if (new Date(connectionRequest.expires_at) < new Date()) {
      // Update to expired
      await supabase
        .from("proximity_requests")
        .update({ status: "expired" })
        .eq("id", validated.requestId);

      return NextResponse.json(
        { success: false, error: "Request has expired" },
        { status: 410 },
      );
    }

    // Handle rejection
    if (!validated.accept) {
      const { error: updateError } = await supabase
        .from("proximity_requests")
        .update({
          status: "rejected",
          responded_at: new Date().toISOString(),
        })
        .eq("id", validated.requestId);

      if (updateError) {
        console.error("Update request error:", updateError);
        return NextResponse.json(
          { success: false, error: "Failed to reject request" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        accepted: false,
        message: "Request rejected successfully",
      });
    }

    // Handle acceptance - generate room code for PeerJS connection
    const roomCode = generateRoomCode();

    const { data: updatedRequest, error: updateError } = await supabase
      .from("proximity_requests")
      .update({
        status: "accepted",
        responded_at: new Date().toISOString(),
        room_code: roomCode,
      })
      .eq("id", validated.requestId)
      .select()
      .single();

    if (updateError) {
      console.error("Accept request error:", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to accept request" },
        { status: 500 },
      );
    }

    // Update both users' status to 'in_call'
    await Promise.all([
      supabase
        .from("proximity_presence")
        .update({ status: "in_call" })
        .eq("session_id", connectionRequest.from_session_id),

      supabase
        .from("proximity_presence")
        .update({ status: "in_call" })
        .eq("session_id", connectionRequest.to_session_id),
    ]);

    return NextResponse.json({
      success: true,
      accepted: true,
      roomCode: roomCode,
      request: {
        id: updatedRequest.id,
        from_session_id: updatedRequest.from_session_id,
        to_session_id: updatedRequest.to_session_id,
      },
    });
  } catch (error) {
    console.error("Respond endpoint error:", error);

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

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTION - Generate unique room code for PeerJS
// ═══════════════════════════════════════════════════════════════════════════════

function generateRoomCode(): string {
  // Generate 8-character alphanumeric code
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude ambiguous chars
  const bytes = randomBytes(8);

  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }

  return code;
}
