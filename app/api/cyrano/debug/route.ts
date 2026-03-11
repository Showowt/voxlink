/**
 * /api/cyrano/debug — Diagnostic endpoint for Claude API
 * Tests API key configuration and Claude connectivity
 *
 * @version 1.0.0
 */

import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    apiKeyPresent: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 15) + "..." : "NOT SET",
    apiKeyLength: apiKey?.length ?? 0,
    nodeEnv: process.env.NODE_ENV,
  };

  if (!apiKey) {
    return NextResponse.json(
      {
        ...diagnostics,
        status: "ERROR",
        message: "ANTHROPIC_API_KEY is not configured in environment variables",
      },
      { status: 500 },
    );
  }

  // Test Claude API with minimal request
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 10,
        messages: [{ role: "user", content: "Say OK" }],
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          ...diagnostics,
          status: "API_ERROR",
          httpStatus: response.status,
          httpStatusText: response.statusText,
          errorBody: responseText.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const data = JSON.parse(responseText);

    return NextResponse.json({
      ...diagnostics,
      status: "OK",
      claudeResponse: data.content?.[0]?.text ?? "No response",
      model: data.model,
      usage: data.usage,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ...diagnostics,
        status: "EXCEPTION",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
