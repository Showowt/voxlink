/**
 * /api/cyrano/route.ts
 * Cyrano Mode — server-side Claude suggestion endpoint
 *
 * Drop this file at: app/api/cyrano/route.ts
 * Requires: ANTHROPIC_API_KEY in your .env.local / Vercel env vars
 *
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiter (30 req/min per IP)
// For production, swap with Upstash Redis or similar
const WINDOW_MS = 60_000;
const MAX_PER_WIN = 30;
const store = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = store.get(ip);
  if (!rec || now > rec.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (rec.count >= MAX_PER_WIN) return true;
  rec.count++;
  return false;
}

export async function POST(req: NextRequest) {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      { status: 429 },
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let systemPrompt: string, userPrompt: string;
  try {
    ({ systemPrompt, userPrompt } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!systemPrompt?.trim() || !userPrompt?.trim()) {
    return NextResponse.json(
      { error: "systemPrompt and userPrompt are required." },
      { status: 400 },
    );
  }

  // ── Verify API key is configured ──────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[Cyrano] ANTHROPIC_API_KEY is not set.");
    return NextResponse.json(
      { error: "Server not configured." },
      { status: 500 },
    );
  }

  // ── Call Claude ───────────────────────────────────────────────────────────
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400, // Tight — suggestions are short
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      console.error("[Cyrano] Claude API error:", upstream.status, body);
      return NextResponse.json({ error: "Upstream error." }, { status: 502 });
    }

    const claudeData = await upstream.json();
    const rawText = claudeData.content?.[0]?.text ?? "";

    // Strip markdown fences if present
    const cleaned = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    // Validate JSON before returning — fail fast with a useful error
    JSON.parse(cleaned); // throws if malformed

    return NextResponse.json({ content: cleaned });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Cyrano] Error:", msg);

    // JSON parse failure = Claude returned non-JSON
    if (msg.includes("JSON") || msg.includes("Unexpected token")) {
      return NextResponse.json(
        { error: "Malformed AI response." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
