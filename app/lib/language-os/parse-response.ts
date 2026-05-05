import type { CorrectionResult } from "./types";

export function parseAIResponse(rawResponse: string): {
  correction: CorrectionResult | null;
  reply: string;
  grammarPatternId: string | null;
  vocabWords: string[];
} {
  let correction: CorrectionResult | null = null;
  let reply = rawResponse;

  // Extract correction block
  const correctionMatch = rawResponse.match(/<correction>([\s\S]*?)<\/correction>/);
  if (correctionMatch) {
    try {
      const parsed = JSON.parse(correctionMatch[1].trim());
      correction = {
        original: String(parsed.original ?? ""),
        corrected: String(parsed.corrected ?? ""),
        isCorrect: Boolean(parsed.isCorrect),
        explanation: String(parsed.explanation ?? "").substring(0, 300),
        patternId: parsed.patternId ?? null,
        patternName: parsed.patternName ?? null,
        fluencyScore: Math.min(10, Math.max(1, Number(parsed.fluencyScore) || 5)),
        flowConnector: parsed.flowConnector ?? null,
        vibeCheck: parsed.fluencyScore >= 9 ? (parsed.vibeCheck ?? null) : null,
      };
    } catch {
      console.warn("[LangOS] Failed to parse correction JSON");
    }
    reply = rawResponse.replace(/<correction>[\s\S]*?<\/correction>/g, "").trim();
  }

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
