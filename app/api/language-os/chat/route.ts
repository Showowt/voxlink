import { NextRequest, NextResponse } from "next/server";
import { getLanguageConfig } from "@/app/lib/language-os/engine";
import { buildPersonaPrompt } from "@/app/lib/language-os/persona-prompt";
import { parseAIResponse } from "@/app/lib/language-os/parse-response";
import { getFPForMessage } from "@/app/lib/language-os/algorithms/fluency";
import type { ChatAPIRequest } from "@/app/lib/language-os/types";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Claude is billed per token — bound what one request can send.
const MAX_MESSAGE_CHARS = 1000;
const MAX_TOTAL_CHARS = 12000;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatAPIRequest;
    const { messages, personaId, languagePair, userId, fluencyScore, weakPatterns, getCorrectionFor, includeTranslation } = body;

    // Validation
    if (!userId || !languagePair || !personaId) {
      return NextResponse.json({ error: "MISSING_REQUIRED_FIELD" }, { status: 400 });
    }

    // Limit by IP (server-observed), not the client-supplied userId — a
    // caller can mint a fresh userId per request. Keep a per-user limit too
    // as a secondary brake for shared IPs.
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const [ipLimit, userLimit] = await Promise.all([
      checkRateLimit(`los-chat:ip:${ip}`, 60, 60000),
      checkRateLimit(`los-chat:user:${userId}`, 40, 60000),
    ]);
    if (!ipLimit.allowed || !userLimit.allowed) {
      return NextResponse.json({ error: "RATE_LIMITED", retryAfter: 60 }, { status: 429 });
    }

    const totalChars = (messages || []).reduce(
      (n, m) => n + (m.content?.length ?? 0),
      0,
    );
    if (
      totalChars > MAX_TOTAL_CHARS ||
      (messages || []).some((m) => (m.content?.length ?? 0) > MAX_MESSAGE_CHARS) ||
      (getCorrectionFor?.length ?? 0) > MAX_MESSAGE_CHARS
    ) {
      return NextResponse.json({ error: "MESSAGE_TOO_LONG" }, { status: 413 });
    }

    const config = getLanguageConfig(languagePair);
    if (!config) {
      return NextResponse.json({ error: "INVALID_LANGUAGE_PAIR" }, { status: 400 });
    }

    const persona = config.personas.find((p) => p.id === personaId);
    if (!persona) {
      return NextResponse.json({ error: "INVALID_PERSONA" }, { status: 400 });
    }

    // Build system prompt
    const systemPrompt = buildPersonaPrompt(persona, config, fluencyScore || 0, weakPatterns || []);

    // Prepare messages (max 20)
    const chatMessages = (messages || []).slice(-20).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // If correction requested, append it
    if (getCorrectionFor) {
      chatMessages.push({ role: "user", content: getCorrectionFor });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY2 || process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      console.error("[LangOS Chat] ANTHROPIC_API_KEY not set");
      const fallback = persona.fallbackResponses[Math.floor(Math.random() * persona.fallbackResponses.length)];
      return NextResponse.json({
        reply: fallback,
        fpEarned: 2,
        sessionId: body.sessionId || crypto.randomUUID(),
        error: "AI_UNAVAILABLE",
        debug: "ANTHROPIC_API_KEY not configured",
      });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: systemPrompt,
        messages: chatMessages,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`[LangOS Chat] Claude API HTTP ${response.status}: ${errorBody.slice(0, 500)}`);
      const fallback = persona.fallbackResponses[Math.floor(Math.random() * persona.fallbackResponses.length)];
      return NextResponse.json({
        reply: fallback,
        fpEarned: 2,
        sessionId: body.sessionId || crypto.randomUUID(),
        error: "AI_UNAVAILABLE",
        debug: `HTTP ${response.status} | ${errorBody.slice(0, 200)}`,
      });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || "";

    // Parse the AI response
    const { correction, reply, grammarPatternId, vocabWords } = parseAIResponse(rawText);

    // Calculate FP
    const isCorrect = correction?.isCorrect ?? true;
    const fpEarned = getFPForMessage(fluencyScore || 0, isCorrect);

    // Get translation if requested
    let translation: string | undefined;
    if (includeTranslation && reply) {
      try {
        const transRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 200,
            system: `Translate the following ${config.targetLanguage} text to ${config.sourceLanguage}. Output ONLY the translation.`,
            messages: [{ role: "user", content: reply }],
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (transRes.ok) {
          const transData = await transRes.json();
          translation = transData.content?.[0]?.text?.trim();
        }
      } catch {
        // Translation optional — continue without
      }
    }

    return NextResponse.json({
      reply,
      translation,
      correction,
      grammarPatternId,
      vocabWords: vocabWords?.slice(0, 5),
      fpEarned,
      sessionId: body.sessionId || crypto.randomUUID(),
    });
  } catch (err) {
    console.error("[LangOS Chat]", err);
    return NextResponse.json(
      { error: "AI_UNAVAILABLE", fallback: "Lo siento, intenta de nuevo." },
      { status: 500 },
    );
  }
}
