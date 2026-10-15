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
import { checkRateLimit } from "@/lib/rate-limit";
import { deviceBudget, serviceBudgetOk } from "@/lib/budget";


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
  const rl = await checkRateLimit(`cyrano:${ip}`, 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in 60 seconds." },
      { status: 429 },
    );
  }
  // Shared Claude spend caps: Redis-backed per-minute limit (survives cold
  // starts), a per-IP daily budget, and the global daily kill-switch — a
  // runaway loop or viral spike degrades instead of billing.
  if (!(await serviceBudgetOk("claude"))) {
    return NextResponse.json({ error: "Temporarily unavailable" }, { status: 503 });
  }
  const dayBudget = await deviceBudget("claude", ip, true, 1000, 2000);
  if (!dayBudget.allowed) {
    return NextResponse.json({ error: "Daily allowance used" }, { status: 429 });
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
  const apiKey = process.env.ANTHROPIC_API_KEY2 || process.env.ANTHROPIC_API_KEY;
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
        model: "claude-haiku-4-5-20251001", // Haiku 4.5: fast, cost-effective for real-time
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
