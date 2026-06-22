import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Rate limiter — 30 requests per minute per IP
const limiter = new Map<string, { count: number; reset: number }>();
function checkLimit(ip: string): boolean {
  const now = Date.now();
  const e = limiter.get(ip);
  if (!e || now > e.reset) {
    limiter.set(ip, { count: 1, reset: now + 60000 });
    return true;
  }
  if (e.count >= 30) return false;
  e.count++;
  return true;
}

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German",
  it: "Italian", pt: "Portuguese", zh: "Chinese", ja: "Japanese",
  ko: "Korean", ar: "Arabic", ru: "Russian", hi: "Hindi",
  nl: "Dutch", pl: "Polish", tr: "Turkish", vi: "Vietnamese",
  th: "Thai", sv: "Swedish", cs: "Czech", ro: "Romanian",
  hu: "Hungarian", fi: "Finnish", da: "Danish", no: "Norwegian",
  he: "Hebrew", el: "Greek", uk: "Ukrainian", id: "Indonesian",
  ms: "Malay", tl: "Filipino", lt: "Lithuanian",
};

interface ConversationTurn {
  speaker: "me" | "partner";
  original: string;
  translated: string;
  lang: string;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const {
      conversation,
      userLang,
      partnerLang,
      latestTurn,
    } = body as {
      conversation: ConversationTurn[];
      userLang: string;
      partnerLang: string;
      latestTurn: ConversationTurn;
    };

    if (!userLang || !partnerLang || !latestTurn) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        insights: null,
        error: "AI_UNAVAILABLE",
      });
    }

    const userLangName = LANG_NAMES[userLang] || userLang;
    const partnerLangName = LANG_NAMES[partnerLang] || partnerLang;

    // Build conversation context (last 10 turns max)
    const recentTurns = (conversation || []).slice(-10);
    const conversationContext = recentTurns
      .map((t) => `[${t.speaker === "me" ? "User" : "Partner"}] (${LANG_NAMES[t.lang] || t.lang}): ${t.original}\n  → Translation: ${t.translated}`)
      .join("\n");

    const isUserSpeaking = latestTurn.speaker === "me";

    const systemPrompt = `You are a real-time language tutor embedded in a live translation call.
The user speaks ${userLangName} and is communicating with someone who speaks ${partnerLangName}.
The user wants to LEARN ${partnerLangName} while having a real conversation.

Your job is to analyze each exchange and provide INSTANT, contextual teaching.
ALL explanations must be in ${userLangName} so the user understands.
Keep responses extremely concise — this appears as a small card during a live call.

Respond with ONLY a JSON object (no markdown, no code fences):
{
  "keyPhrase": {
    "original": "the most useful phrase from this exchange in ${partnerLangName}",
    "translation": "translation in ${userLangName}",
    "pronunciation": "simple phonetic guide",
    "context": "1 sentence in ${userLangName} explaining when/how to use this phrase"
  },
  "correction": ${isUserSpeaking ? `{
    "userSaid": "what the user's message translated to in ${partnerLangName}",
    "betterWay": "a more natural way to say it in ${partnerLangName}, or null if it was good",
    "explanation": "brief explanation in ${userLangName} of why the alternative is better, or a compliment if correct"
  }` : "null"},
  "grammarTip": "one short grammar insight in ${userLangName} relevant to this exchange, or null if nothing notable",
  "responseHint": ${!isUserSpeaking ? `"a suggested response the user could try saying in ${partnerLangName} with ${userLangName} translation in parentheses"` : "null"},
  "vocabWords": [
    {
      "word": "word in ${partnerLangName}",
      "meaning": "meaning in ${userLangName}",
      "type": "noun/verb/adjective/phrase"
    }
  ]
}`;

    const userMessage = `CONVERSATION SO FAR:
${conversationContext || "(first exchange)"}

LATEST EXCHANGE:
[${latestTurn.speaker === "me" ? "User" : "Partner"}] (${LANG_NAMES[latestTurn.lang] || latestTurn.lang}): ${latestTurn.original}
→ Translation: ${latestTurn.translated}

Analyze this exchange and provide learning insights.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2024-10-22",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error("[LearningInsights] API error:", response.status);
      return NextResponse.json({ insights: null, error: "API_ERROR" });
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || "";

    // Parse the JSON response
    try {
      // Strip any accidental markdown fences
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const insights = JSON.parse(cleaned);
      return NextResponse.json({ insights });
    } catch {
      console.error("[LearningInsights] Failed to parse:", rawText.slice(0, 200));
      return NextResponse.json({ insights: null, error: "PARSE_ERROR" });
    }
  } catch (err) {
    console.error("[LearningInsights]", err);
    return NextResponse.json({ insights: null, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
