import type { CorrectionResult } from "./types";

function buildCorrection(parsed: Record<string, unknown>): CorrectionResult {
  const fluencyScore = Math.min(10, Math.max(1, Number(parsed.fluencyScore) || 5));
  return {
    original: String(parsed.original ?? ""),
    corrected: String(parsed.corrected ?? ""),
    isCorrect: Boolean(parsed.isCorrect),
    explanation: String(parsed.explanation ?? "").substring(0, 300),
    patternId: (parsed.patternId as string | null) ?? null,
    patternName: (parsed.patternName as string | null) ?? null,
    fluencyScore,
    flowConnector: (parsed.flowConnector as string | null) ?? null,
    vibeCheck: fluencyScore >= 9 ? ((parsed.vibeCheck as string | null) ?? null) : null,
  };
}

export function parseAIResponse(rawResponse: string): {
  correction: CorrectionResult | null;
  reply: string;
  grammarPatternId: string | null;
  vocabWords: string[];
} {
  let correction: CorrectionResult | null = null;
  let reply = rawResponse;

  // Strategy 1: <correction>...</correction> XML tags (preferred format)
  const xmlMatch = rawResponse.match(/<correction>([\s\S]*?)<\/correction>/);
  if (xmlMatch) {
    try {
      const parsed = JSON.parse(xmlMatch[1].trim()) as Record<string, unknown>;
      correction = buildCorrection(parsed);
    } catch {
      console.warn("[LangOS] Failed to parse correction JSON inside <correction> tags");
    }
    reply = rawResponse.replace(/<correction>[\s\S]*?<\/correction>/g, "").trim();
  }

  // Strategy 2: ```json ... ``` code fence (fallback — model wraps in markdown)
  if (!correction) {
    const fenceMatch = rawResponse.match(/```json\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        const parsed = JSON.parse(fenceMatch[1].trim()) as Record<string, unknown>;
        if ("original" in parsed && "corrected" in parsed) {
          correction = buildCorrection(parsed);
          reply = rawResponse.replace(/```json\s*[\s\S]*?```/, "").trim();
        }
      } catch {
        console.warn("[LangOS] Failed to parse correction JSON inside code fence");
      }
    }
  }

  // Strategy 3: Raw JSON object at the start of the response (no wrapper at all)
  if (!correction) {
    const rawJsonMatch = rawResponse.match(/^(\{[\s\S]*?\})/);
    if (rawJsonMatch) {
      try {
        const parsed = JSON.parse(rawJsonMatch[1]) as Record<string, unknown>;
        if ("original" in parsed && "corrected" in parsed) {
          correction = buildCorrection(parsed);
          reply = rawResponse.replace(rawJsonMatch[1], "").trim();
        }
      } catch {
        // Not a valid JSON block at the start — silently ignore
      }
    }
  }

  // Clean up any remaining separators or whitespace
  reply = reply.replace(/^---+\s*/g, "").replace(/\s*---+$/g, "").trim();

  // Extract vocab words if tagged
  const vocabMatch = reply.match(/<vocab>([\s\S]*?)<\/vocab>/);
  let vocabWords: string[] = [];
  if (vocabMatch) {
    try {
      vocabWords = JSON.parse(vocabMatch[1]) as string[];
    } catch {
      /* silent */
    }
    reply = reply.replace(/<vocab>[\s\S]*?<\/vocab>/g, "").trim();
  }

  // Extract grammar pattern if tagged
  const patternMatch = reply.match(/<pattern>(.*?)<\/pattern>/);
  const grammarPatternId = patternMatch ? patternMatch[1].trim() : null;
  if (patternMatch) {
    reply = reply.replace(/<pattern>.*?<\/pattern>/g, "").trim();
  }

  return { correction, reply, grammarPatternId, vocabWords };
}
