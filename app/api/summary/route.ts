import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Rate limiter
const store = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + 60000 });
    return false;
  }
  if (entry.count >= 10) return true;
  entry.count++;
  return false;
}

interface Message {
  original: string;
  translated: string;
  sender: "me" | "partner";
  timestamp?: string;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const { messages, duration, languages } = (await req.json()) as {
      messages: Message[];
      duration: number;
      languages: string[];
    };

    if (!messages || messages.length < 2) {
      return NextResponse.json({
        overview: "Brief exchange with no notable content.",
        keyPhrases: [],
        followUps: [],
        mood: "neutral",
        languages: languages || [],
      });
    }

    // Format transcript for Claude
    const transcript = messages
      .map((m) => `${m.sender === "me" ? "You" : "Partner"}: ${m.original}${m.translated ? ` [Translation: ${m.translated}]` : ""}`)
      .join("\n");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback without AI — basic summary
      return NextResponse.json({
        overview: `${Math.round((duration || 0) / 60)} minute conversation with ${messages.length} messages exchanged.`,
        keyPhrases: messages
          .filter((m) => m.sender === "partner" && m.original.split(" ").length >= 3)
          .slice(0, 5)
          .map((m) => ({
            original: m.original,
            translation: m.translated || m.original,
            language: languages?.[1] || "es",
          })),
        followUps: [],
        mood: "warm",
        languages: languages || [],
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
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: `You are summarizing a translated conversation between two people. Be concise. Output ONLY valid JSON with this exact structure:
{
  "overview": "2-sentence summary of what was discussed",
  "keyPhrases": [{"original": "phrase in foreign language", "translation": "English translation", "language": "es"}],
  "followUps": ["any next steps or plans mentioned"],
  "mood": "warm|professional|tense|playful"
}
Max 5 keyPhrases, max 3 followUps. Focus on the most interesting/useful phrases the partner said.`,
        messages: [
          {
            role: "user",
            content: `Summarize this ${Math.round((duration || 0) / 60)} minute conversation:\n\n${transcript}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";

    // Parse JSON from Claude response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json({
        overview: parsed.overview || "Conversation completed.",
        keyPhrases: (parsed.keyPhrases || []).slice(0, 5),
        followUps: (parsed.followUps || []).slice(0, 3),
        mood: parsed.mood || "warm",
        languages: languages || [],
      });
    }

    return NextResponse.json({
      overview: "Conversation completed.",
      keyPhrases: [],
      followUps: [],
      mood: "warm",
      languages: languages || [],
    });
  } catch (err) {
    console.error("[Summary] Error:", err);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}
