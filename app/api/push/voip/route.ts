import { NextRequest, NextResponse } from "next/server";
import http2 from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // node:http2 is required for APNs (HTTP/2)

const APNS_KEY = process.env.APNS_KEY; // contents of the AuthKey_XXX.p8
const APNS_KEY_ID = process.env.APNS_KEY_ID;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID;
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || "com.entrevoz.app";
const APNS_HOST =
  process.env.APNS_ENV === "sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";

// APNs provider JWT (ES256), reused ~50 min.
let cachedJwt: { token: string; iat: number } | null = null;
function apnsJwt(): string | null {
  if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.iat < 3000) return cachedJwt.token;
  const b64 = (b: string | Buffer) => Buffer.from(b).toString("base64url");
  const header = b64(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }));
  const payload = b64(JSON.stringify({ iss: APNS_TEAM_ID, iat: now }));
  const key = createPrivateKey(APNS_KEY.replace(/\\n/g, "\n"));
  const sig = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  const token = `${header}.${payload}.${b64(sig)}`;
  cachedJwt = { token, iat: now };
  return token;
}

function sendApns(
  deviceToken: string,
  payload: unknown,
  jwt: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${APNS_HOST}`);
    client.on("error", reject);
    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": `${APNS_BUNDLE_ID}.voip`,
      "apns-push-type": "voip",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    request.on("response", (h) => {
      status = Number(h[":status"]);
    });
    request.setEncoding("utf8");
    request.on("data", (d) => (body += d));
    request.on("end", () => {
      client.close();
      resolve({ status, body });
    });
    request.on("error", (e) => {
      client.close();
      reject(e);
    });
    request.write(JSON.stringify(payload));
    request.end();
  });
}

// Ring a device even when the app is closed by delivering a VoIP push that the
// native layer turns into a CallKit incoming call. Targeted by device id or
// dial code (the caller knows one of them from the invite).
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rl = await checkRateLimit(`voip:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const jwt = apnsJwt();
  if (!jwt) {
    return NextResponse.json({ delivered: false, reason: "not_configured" });
  }
  const admin = supabaseAdmin();
  if (!admin) {
    return NextResponse.json({ delivered: false, reason: "no_db" });
  }

  try {
    const { target, targetDeviceId, targetDialCode, room, type, fromName, fromLang, fromDevice } =
      await req.json();
    // `target` is an ambiguous address (device id OR dial code — the caller has
    // one from the invite); explicit fields override it.
    const dev = typeof targetDeviceId === "string" ? targetDeviceId : undefined;
    const code = typeof targetDialCode === "string" ? targetDialCode : undefined;
    const any = typeof target === "string" ? target : undefined;
    if (!room || (!dev && !code && !any)) {
      return NextResponse.json({ error: "room + target required" }, { status: 400 });
    }

    let query = admin.from("push_tokens").select("voip_token").limit(1);
    if (dev) query = query.eq("device_id", dev);
    else if (code) query = query.eq("dial_code", code);
    else if (any) query = query.or(`device_id.eq.${any},dial_code.eq.${any}`);
    const { data } = await query.maybeSingle();
    if (!data?.voip_token) {
      return NextResponse.json({ delivered: false, reason: "no_token" });
    }

    const payload = {
      aps: {},
      invite: {
        room,
        type: type === "audio" ? "audio" : "video",
        fromName: typeof fromName === "string" ? fromName.slice(0, 60) : "Someone",
        fromLang: typeof fromLang === "string" ? fromLang : "en",
        fromDevice: typeof fromDevice === "string" ? fromDevice : "",
        t: Date.now(),
      },
    };

    const res = await sendApns(data.voip_token, payload, jwt);
    return NextResponse.json({
      delivered: res.status === 200,
      status: res.status,
      ...(res.status !== 200 ? { apns: res.body } : {}),
    });
  } catch (e) {
    console.error("[push/voip]", e);
    return NextResponse.json({ delivered: false, error: "send_failed" }, { status: 502 });
  }
}
