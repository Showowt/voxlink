import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getEntitlement } from "@/lib/entitlement";
import {
  addVideoMinutes,
  getMonthlyVideoMinutes,
  FREE_VIDEO_MINUTES,
} from "@/lib/video-minutes";

export const dynamic = "force-dynamic";

// POST /api/usage/video { deviceId, userId?, minutes }
// End-of-call report of billed (Daily) video minutes. Clients send it via the
// reliable-post outbox so a backgrounded/killed app still reports eventually.
// The hard cap lives in /api/daily/room's token expiry; this keeps the
// month-to-date total honest between room creations.
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`usage-video:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  const userId = typeof body.userId === "string" ? body.userId : "";
  const minutes = typeof body.minutes === "number" ? body.minutes : 0;

  if ((!deviceId || deviceId.length < 8) && !userId) {
    return NextResponse.json({ error: "identity required" }, { status: 400 });
  }
  if (!(minutes > 0)) {
    return NextResponse.json({ success: true, skipped: true });
  }

  const ent = await getEntitlement({ userId: userId || undefined, deviceId: deviceId || undefined });
  await addVideoMinutes(ent.userId, deviceId, minutes);

  // Return remaining allowance so the client can show "X free minutes left".
  const used = await getMonthlyVideoMinutes(ent.userId, deviceId);
  const remaining = ent.entitled ? null : Math.max(0, FREE_VIDEO_MINUTES() - used);
  return NextResponse.json({ success: true, remaining, entitled: ent.entitled });
}

// GET /api/usage/video?deviceId=xxx → remaining free minutes this month
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId") || "";
  if (deviceId.length < 8) {
    return NextResponse.json({ remaining: null });
  }
  const ent = await getEntitlement({ deviceId });
  if (ent.entitled) return NextResponse.json({ remaining: null, entitled: true });
  const used = await getMonthlyVideoMinutes(ent.userId, deviceId);
  return NextResponse.json({
    remaining: Math.max(0, FREE_VIDEO_MINUTES() - used),
    entitled: false,
  });
}
