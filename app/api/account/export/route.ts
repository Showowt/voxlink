import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Rate limiter: 3 requests per hour per IP
const limiter = new Map<string, { count: number; reset: number }>();
const HOUR_MS = 3600000;
const MAX_REQUESTS_PER_HOUR = 3;

function checkLimit(ip: string): boolean {
  const now = Date.now();
  const entry = limiter.get(ip);
  if (!entry || now > entry.reset) {
    limiter.set(ip, { count: 1, reset: now + HOUR_MS });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_HOUR) return false;
  entry.count++;
  return true;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET /api/account/export?deviceId=xxx
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip)) {
    return NextResponse.json(
      { error: "Rate limited. Maximum 3 export requests per hour." },
      { status: 429 },
    );
  }

  const deviceId = req.nextUrl.searchParams.get("deviceId");
  if (!deviceId || typeof deviceId !== "string" || deviceId.length < 8) {
    return NextResponse.json(
      { error: "Valid deviceId is required" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({
      deviceId,
      serverData: null,
      message: "Database not configured. Only client-side data available.",
      exportedAt: new Date().toISOString(),
    });
  }

  try {
    // Gather all server-side data for this user in parallel
    const [progressRes, srsRes, importsRes, contactsRes] = await Promise.all([
      supabase
        .from("language_os_progress")
        .select("*")
        .eq("user_id", deviceId),
      supabase
        .from("los_srs_cards")
        .select("*")
        .eq("user_id", deviceId),
      supabase
        .from("los_entrevoz_imports")
        .select("*")
        .eq("user_id", deviceId),
      supabase
        .from("contacts")
        .select("*")
        .eq("owner_device_id", deviceId),
    ]);

    const exportData = {
      deviceId,
      exportedAt: new Date().toISOString(),
      serverData: {
        languageProgress: progressRes.data || [],
        srsCards: srsRes.data || [],
        entrevozImports: importsRes.data || [],
        contacts: contactsRes.data || [],
      },
    };

    return NextResponse.json(exportData);
  } catch (err) {
    console.error("[Account Export]", err);
    return NextResponse.json(
      { error: "Failed to export data. Please try again." },
      { status: 500 },
    );
  }
}
