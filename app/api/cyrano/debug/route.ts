/**
 * /api/cyrano/debug — Diagnostic endpoint for Claude API
 * Protected: requires CRON_SECRET bearer token in production
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Require auth in production
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    apiKeyPresent: !!apiKey,
    apiKeyLength: apiKey?.length ?? 0,
    nodeEnv: process.env.NODE_ENV,
  };

  if (!apiKey) {
    return NextResponse.json(
      { ...diagnostics, status: "ERROR", message: "ANTHROPIC_API_KEY not configured" },
      { status: 500 },
    );
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        messages: [{ role: "user", content: "Say OK" }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        { ...diagnostics, status: "API_ERROR", httpStatus: response.status },
        { status: 502 },
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json(
        { ...diagnostics, status: "PARSE_ERROR", rawResponse: responseText.slice(0, 200) },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ...diagnostics,
      status: "OK",
      claudeResponse: data.content?.[0]?.text ?? "No response",
      model: data.model,
    });
  } catch (error) {
    return NextResponse.json(
      { ...diagnostics, status: "EXCEPTION", error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
