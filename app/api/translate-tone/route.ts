import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Tone = "formal" | "casual" | "romantic" | "professional";

const TONE_PROMPTS: Record<Tone, string> = {
  formal: "Translate formally and politely, using usted form in Spanish.",
  casual: "Translate casually and naturally, like talking to a friend. Use tu form in Spanish.",
  romantic: "Translate in a warm, affectionate tone. Use endearing phrasing.",
  professional: "Translate in a professional business tone. Be concise and clear.",
};

export async function POST(req: NextRequest) {
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
        model: "claude-sonnet-4-6",
        max_tokens: 150,
        system: `You are a translation engine. ${toneInstruction} Translate from ${from} to ${to}. Output ONLY the translation, nothing else.`,
        messages: [{ role: "user", content: text }],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json({ translated: text, tone });
    }

    const data = await response.json();
    const translated = data.content?.[0]?.text?.trim() || text;

    return NextResponse.json({ translated, tone, original: text });
  } catch {
    return NextResponse.json({ error: "Translation failed" }, { status: 500 });
  }
}
