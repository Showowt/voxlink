/**
 * /api/cyrano/route.ts
 * Cyrano Mode — server-side Claude suggestion endpoint
 *
 * SECURITY: Rate limited, prompt validated, timeout protected
 * PERFORMANCE: Uses Haiku for speed, 250 max tokens
 *
 * @version 2.0.0
 */

import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITER WITH CLEANUP (prevents memory leak)
// ═══════════════════════════════════════════════════════════════════════════
const WINDOW_MS = 60_000;
const MAX_PER_WIN = 30;
const MAX_STORE_SIZE = 10_000; // Prevent unbounded growth
const store = new Map<string, { count: number; resetAt: number }>();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  store.forEach((rec, ip) => {
    if (now > rec.resetAt) store.delete(ip);
  });
}

function isRateLimited(ip: string): boolean {
  // Periodic cleanup (1% of requests) + size-based cleanup
  if (Math.random() < 0.01 || store.size > MAX_STORE_SIZE) {
    cleanupExpiredEntries();
  }

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

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
const MAX_SYSTEM_PROMPT = 3000;
const MAX_USER_PROMPT = 5000;
const CLAUDE_TIMEOUT_MS = 12_000;

export async function POST(req: NextRequest) {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in 60 seconds." },
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

  // ── Validate prompt lengths (prevent DOS) ────────────────────────────────
  if (systemPrompt.length > MAX_SYSTEM_PROMPT) {
    return NextResponse.json(
      { error: "System prompt too long." },
      { status: 413 },
    );
  }
  if (userPrompt.length > MAX_USER_PROMPT) {
    return NextResponse.json(
      { error: "User prompt too long." },
      { status: 413 },
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

  // ── Call Claude with timeout ──────────────────────────────────────────────
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307", // Haiku: fast, cost-effective for real-time
        max_tokens: 250, // Tight — 3 suggestions need ~150 tokens
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstream.ok) {
      const body = await upstream.text();
      // Log full error for debugging (will show in Vercel logs)
      console.error("[Cyrano] Claude API error:", {
        status: upstream.status,
        statusText: upstream.statusText,
        body: body.slice(0, 500), // First 500 chars to avoid log truncation
        apiKeyPresent: !!apiKey,
        apiKeyPrefix: apiKey ? apiKey.slice(0, 12) + "..." : "none",
      });

      if (upstream.status === 529) {
        return NextResponse.json(
          { error: "AI is overloaded. Retrying..." },
          { status: 503 },
        );
      }
      if (upstream.status === 401) {
        return NextResponse.json(
          { error: "Invalid API key configuration." },
          { status: 500 },
        );
      }
      if (upstream.status === 400) {
        return NextResponse.json(
          { error: "Invalid request to AI." },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: "Upstream error." }, { status: 502 });
    }

    const claudeData = await upstream.json();
    const rawText = claudeData.content?.[0]?.text ?? "";

    // Strip markdown fences if present (handles ```json, ```typescript, etc.)
    const cleaned = rawText
      .replace(/```\w*\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    // Validate JSON structure before returning
    const parsed = JSON.parse(cleaned);

    // Validate suggestions array exists and has correct structure
    if (
      !parsed.suggestions ||
      !Array.isArray(parsed.suggestions) ||
      parsed.suggestions.length === 0
    ) {
      throw new Error("Invalid suggestions structure");
    }

    return NextResponse.json({ content: cleaned });
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    // Handle timeout specifically
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[Cyrano] Request timeout");
      return NextResponse.json(
        { error: "Suggestions timed out. Retrying..." },
        { status: 504 },
      );
    }

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
