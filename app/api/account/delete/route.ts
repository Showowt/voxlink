import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Rate limiter: 1 request per hour per IP
const limiter = new Map<string, { count: number; reset: number }>();
const HOUR_MS = 3600000;
const MAX_REQUESTS_PER_HOUR = 1;

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

interface DeleteRequestBody {
  deviceId: string;
  confirmText: string;
}

// POST /api/account/delete
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip)) {
    return NextResponse.json(
      { error: "Rate limited. Maximum 1 delete request per hour." },
      { status: 429 },
    );
  }

  let body: DeleteRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { deviceId, confirmText } = body;

  if (!deviceId || typeof deviceId !== "string" || deviceId.length < 8) {
    return NextResponse.json(
      { error: "Valid deviceId is required" },
      { status: 400 },
    );
  }

  if (confirmText !== "DELETE") {
    return NextResponse.json(
      { error: "Confirmation text must be exactly 'DELETE'" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    // No server data to delete, but client-side will handle localStorage/IndexedDB
    return NextResponse.json({
      success: true,
      deletedCounts: {
        languageProgress: 0,
        srsCards: 0,
        entrevozImports: 0,
        contacts: 0,
      },
      message: "Database not configured. Client-side data will be cleared separately.",
    });
  }

  try {
    // Delete from all tables where user_id or device_id matches
    const [progressDel, srsDel, importsDel, contactsDel] = await Promise.all([
      supabase
        .from("language_os_progress")
        .delete()
        .eq("user_id", deviceId)
        .select("id"),
      supabase
        .from("los_srs_cards")
        .delete()
        .eq("user_id", deviceId)
        .select("id"),
      supabase
        .from("los_entrevoz_imports")
        .delete()
        .eq("user_id", deviceId)
        .select("id"),
      supabase
        .from("contacts")
        .delete()
        .eq("owner_device_id", deviceId)
        .select("id"),
    ]);

    const deletedCounts = {
      languageProgress: progressDel.data?.length ?? 0,
      srsCards: srsDel.data?.length ?? 0,
      entrevozImports: importsDel.data?.length ?? 0,
      contacts: contactsDel.data?.length ?? 0,
    };

    // Log any errors (non-fatal -- some tables might not exist)
    const errors: string[] = [];
    if (progressDel.error) errors.push(`progress: ${progressDel.error.message}`);
    if (srsDel.error) errors.push(`srs: ${srsDel.error.message}`);
    if (importsDel.error) errors.push(`imports: ${importsDel.error.message}`);
    if (contactsDel.error) errors.push(`contacts: ${contactsDel.error.message}`);

    if (errors.length > 0) {
      console.error("[Account Delete] Partial errors:", errors.join("; "));
    }

    return NextResponse.json({
      success: true,
      deletedCounts,
    });
  } catch (err) {
    console.error("[Account Delete]", err);
    return NextResponse.json(
      { error: "Failed to delete data. Please try again." },
      { status: 500 },
    );
  }
}
