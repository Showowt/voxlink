import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase, type NearbyUser } from "@/lib/supabase";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/proximity/nearby - Get users within radius
// ═══════════════════════════════════════════════════════════════════════════════

const NearbyQuerySchema = z.object({
  lat: z.string().transform(Number).pipe(z.number().min(-90).max(90)),
  lng: z.string().transform(Number).pipe(z.number().min(-180).max(180)),
  radius: z
    .string()
    .optional()
    .default("5000")
    .transform(Number)
    .pipe(z.number().min(100).max(50000)), // 100m to 50km
  sessionId: z.string().optional(), // Exclude self
});

export async function GET(request: NextRequest) {
  try {
    // Parse and validate query parameters
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);
    const validated = NearbyQuerySchema.parse(searchParams);

    // Build query to find nearby users
    // Using PostGIS ST_DWithin for efficient radius search
    const { data, error } = await supabase.rpc("find_nearby_users", {
      user_lat: validated.lat,
      user_lng: validated.lng,
      radius_meters: validated.radius,
      exclude_session: validated.sessionId || null,
    });

    if (error) {
      console.error("Nearby query error:", error);

      // If RPC function doesn't exist, fall back to simple query
      if (error.code === "42883") {
        return fallbackNearbySearch(validated);
      }

      return NextResponse.json(
        { success: false, error: "Failed to fetch nearby users" },
        { status: 500 },
      );
    }

    // Format results
    const users: NearbyUser[] = data.map((row: any) => ({
      id: row.id,
      session_id: row.session_id,
      language: row.language,
      distance: Math.round(row.distance),
      status: row.status,
    }));

    return NextResponse.json({
      success: true,
      users,
      count: users.length,
      radius: validated.radius,
    });
  } catch (error) {
    console.error("Nearby endpoint error:", error);

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
// FALLBACK: Simple haversine distance calculation (if PostGIS RPC not available)
// ═══════════════════════════════════════════════════════════════════════════════

async function fallbackNearbySearch(params: z.infer<typeof NearbyQuerySchema>) {
  try {
    // Get all active presence records
    let query = supabase
      .from("proximity_presence")
      .select("id, session_id, language, lat, lng, status")
      .eq("status", "available")
      .gt("expires_at", new Date().toISOString());

    // Exclude self
    if (params.sessionId) {
      query = query.neq("session_id", params.sessionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Fallback query error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to fetch users" },
        { status: 500 },
      );
    }

    // Calculate distances using haversine formula
    const users: NearbyUser[] = data
      .map((user) => ({
        id: user.id,
        session_id: user.session_id,
        language: user.language,
        distance: calculateHaversineDistance(
          params.lat,
          params.lng,
          user.lat,
          user.lng,
        ),
        status: user.status,
      }))
      .filter((user) => user.distance <= params.radius)
      .sort((a, b) => a.distance - b.distance);

    return NextResponse.json({
      success: true,
      users,
      count: users.length,
      radius: params.radius,
      fallback: true,
    });
  } catch (error) {
    console.error("Fallback error:", error);
    return NextResponse.json(
      { success: false, error: "Fallback search failed" },
      { status: 500 },
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HAVERSINE DISTANCE FORMULA - Calculate distance between two lat/lng points
// ═══════════════════════════════════════════════════════════════════════════════

function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // Distance in meters
}
