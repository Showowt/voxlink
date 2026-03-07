import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/proximity/request - Send connection request to another user
// ═══════════════════════════════════════════════════════════════════════════════

const RequestSchema = z.object({
  fromSessionId: z.string().min(1, "From session ID required"),
  targetId: z.string().uuid("Invalid target user ID"),
  message: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = RequestSchema.parse(body);

    // Verify target user exists and is available
    const { data: targetUser, error: targetError } = await supabase
      .from("proximity_presence")
      .select("id, session_id, status")
      .eq("id", validated.targetId)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (targetError || !targetUser) {
      return NextResponse.json(
        { success: false, error: "Target user not found or offline" },
        { status: 404 },
      );
    }

    // Check if target is available
    if (targetUser.status !== "available") {
      return NextResponse.json(
        { success: false, error: "Target user is busy or in a call" },
        { status: 409 },
      );
    }

    // Check if there's already a pending request between these users
    const { data: existingRequest } = await supabase
      .from("proximity_requests")
      .select("id, status")
      .or(
        `and(from_session_id.eq.${validated.fromSessionId},to_session_id.eq.${targetUser.session_id}),` +
          `and(from_session_id.eq.${targetUser.session_id},to_session_id.eq.${validated.fromSessionId})`,
      )
      .eq("status", "pending")
      .single();

    if (existingRequest) {
      return NextResponse.json(
        {
          success: false,
          error: "Request already pending between these users",
        },
        { status: 409 },
      );
    }

    // Create connection request
    const { data: connectionRequest, error: createError } = await supabase
      .from("proximity_requests")
      .insert({
        from_session_id: validated.fromSessionId,
        to_session_id: targetUser.session_id,
        message: validated.message,
        status: "pending",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min expiry
      })
      .select()
      .single();

    if (createError) {
      console.error("Create request error:", createError);
      return NextResponse.json(
        { success: false, error: "Failed to create connection request" },
        { status: 500 },
      );
    }

    // Supabase Realtime will notify the target user automatically
    // via the subscription on proximity_requests table

    return NextResponse.json(
      {
        success: true,
        requestId: connectionRequest.id,
        expiresAt: connectionRequest.expires_at,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Request endpoint error:", error);

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
// GET /api/proximity/request - Get pending requests for a session
// ═══════════════════════════════════════════════════════════════════════════════

const GetRequestsSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
});

export async function GET(request: NextRequest) {
  try {
    // Parse query parameters
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validated = GetRequestsSchema.parse(searchParams);

    // Get all pending requests for this session
    const { data, error } = await supabase
      .from("proximity_requests")
      .select(
        `
        id,
        from_session_id,
        to_session_id,
        message,
        status,
        created_at,
        expires_at
      `,
      )
      .eq("to_session_id", validated.sessionId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Get requests error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch requests" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      requests: data,
      count: data.length,
    });
  } catch (error) {
    console.error("Get requests error:", error);

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
