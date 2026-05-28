import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const limiter = new Map<string, { count: number; reset: number }>();
function checkLimit(ip: string, max: number): boolean {
  const now = Date.now();
  const e = limiter.get(ip);
  if (!e || now > e.reset) {
    limiter.set(ip, { count: 1, reset: now + 60000 });
    return true;
  }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese",
  de: "German", it: "Italian", zh: "Chinese", ja: "Japanese",
  ko: "Korean", ar: "Arabic", ru: "Russian", hi: "Hindi",
  nl: "Dutch", pl: "Polish", tr: "Turkish", vi: "Vietnamese",
  th: "Thai", id: "Indonesian", uk: "Ukrainian", el: "Greek",
  he: "Hebrew", sv: "Swedish", cs: "Czech", ro: "Romanian",
  hu: "Hungarian", fi: "Finnish", lt: "Lithuanian", da: "Danish",
  no: "Norwegian", ms: "Malay", tl: "Filipino",
};

type Tone = "formal" | "casual" | "romantic" | "professional";

const TONE_PROMPTS: Record<Tone, string> = {
  formal: "Translate formally and politely, using usted form in Spanish.",
  casual: "Translate casually and naturally, like talking to a friend. Use tu form in Spanish.",
  romantic: "Translate in a warm, affectionate tone. Use endearing phrasing.",
  professional: "Translate in a professional business tone. Be concise and clear.",
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip, 20)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const { text, from, to, tone } = (await req.json()) as {
      text: string;
      from: string;
      to: string;
      tone: Tone;
    };

    if (!text || !from || !to) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Fallback: just use regular translate
      return NextResponse.json({ translated: text, tone: tone || "casual" });
    }

    const toneInstruction = TONE_PROMPTS[tone] || TONE_PROMPTS.casual;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 150,
        system: `You are a real-time translation engine for a live conversation. ${toneInstruction} Translate from ${LANG_NAMES[from] || from} to ${LANG_NAMES[to] || to}. Output ONLY the translated text. No quotes, no explanation, no extra text.`,
        messages: [{ role: "user", content: text }],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      console.error("[TranslateTone] Claude API error:", response.status, errText);
      return NextResponse.json(
        { error: "Translation provider failed", detail: response.status },
        { status: 502 },
      );
    }

    const data = await response.json();
    const translated = data.content?.[0]?.text?.trim() || text;

    return NextResponse.json({ translated, tone, original: text });
  } catch (err) {
    console.error("[TranslateTone] Error:", err);
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
