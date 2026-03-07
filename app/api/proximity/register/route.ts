import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/proximity/register - Register user presence with location
// ═══════════════════════════════════════════════════════════════════════════════

const RegisterSchema = z.object({
  sessionId: z.string().min(1, "Session ID required"),
  language: z.enum([
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "zh",
    "ja",
    "ko",
    "ar",
    "ru",
    "hi",
  ]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  status: z.enum(["available", "busy", "in_call"]).default("available"),
});

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const validated = RegisterSchema.parse(body);

    // Get user agent for tracking
    const userAgent = request.headers.get("user-agent") || undefined;

    // Check if session already exists
    const { data: existing } = await supabase
      .from("proximity_presence")
      .select("id, session_id")
      .eq("session_id", validated.sessionId)
      .single();

    if (existing) {
      // Update existing presence (heartbeat)
      const { data, error } = await supabase
        .from("proximity_presence")
        .update({
          language: validated.language,
          lat: validated.lat,
          lng: validated.lng,
          location: `POINT(${validated.lng} ${validated.lat})`,
          status: validated.status,
          user_agent: userAgent,
          last_heartbeat: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min TTL
        })
        .eq("session_id", validated.sessionId)
        .select()
        .single();

      if (error) {
        console.error("Update presence error:", error);
        return NextResponse.json(
          { success: false, error: "Failed to update presence" },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        userId: data.id,
        action: "updated",
      });
    }

    // Create new presence
    const { data, error } = await supabase
      .from("proximity_presence")
      .insert({
        session_id: validated.sessionId,
        language: validated.language,
        lat: validated.lat,
        lng: validated.lng,
        location: `POINT(${validated.lng} ${validated.lat})`,
        status: validated.status,
        user_agent: userAgent,
        last_heartbeat: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Insert presence error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to register presence" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        userId: data.id,
        action: "created",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Register endpoint error:", error);

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
