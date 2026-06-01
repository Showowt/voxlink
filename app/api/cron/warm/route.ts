import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

const SITE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://www.entrevoz.co";

const WARMUP_TARGETS = [
  { path: "/api/health", method: "GET" as const },
  { path: "/api/turn", method: "GET" as const },
  {
    path: "/api/translate",
    method: "POST" as const,
    body: JSON.stringify({ text: "warmup", from: "en", to: "es" }),
  },
  {
    path: "/api/cyrano",
    method: "POST" as const,
    body: JSON.stringify({ systemPrompt: "warmup", userPrompt: "warmup" }),
  },
];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();

  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  const results = await Promise.all(
    WARMUP_TARGETS.map(async (target) => {
      const start = Date.now();
      try {
        const res = await fetch(`${SITE_URL}${target.path}`, {
          method: target.method,
          headers: { "Content-Type": "application/json", "X-Warmup": "true" },
          body: target.method === "POST" ? target.body : undefined,
          signal: AbortSignal.timeout(10000),
        });
        return { path: target.path, status: res.status, latency: Date.now() - start, ok: res.status < 500 };
      } catch {
        return { path: target.path, status: 0, latency: Date.now() - start, ok: false };
      }
    }),
  );

  console.log(`[Warmup] ${results.every((r) => r.ok) ? "OK" : "PARTIAL"} | ${Date.now() - startTime}ms`);

  return NextResponse.json({ success: true, results, totalMs: Date.now() - startTime });
}
