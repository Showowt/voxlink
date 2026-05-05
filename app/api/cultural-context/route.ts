import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Client-side cultural tips — no API needed for common cases
const CULTURAL_TIPS: Record<string, Record<string, string[]>> = {
  es: {
    greetings: [
      "In Colombia, greetings include a kiss on the cheek between men and women",
      "Always greet everyone individually in a group setting",
      "'Buenas' works as a universal greeting any time of day",
    ],
    dining: [
      "In Colombia, the person who invites typically pays",
      "'Provecho' is said before meals — like 'bon appetit'",
      "Tipping 10% is standard but not always expected",
    ],
    conversation: [
      "'Ahorita' can mean right now or later — context matters",
      "Colombians often use diminutives (-ito/-ita) to be friendly",
      "'No dar papaya' means don't make yourself vulnerable",
      "Direct 'no' can seem rude — softer refusals are preferred",
    ],
    time: [
      "Social events often start 30-60 minutes late (hora colombiana)",
      "Business meetings are more punctual than social events",
    ],
  },
  fr: {
    greetings: [
      "Two cheek kisses (la bise) is standard between friends",
      "Use 'vous' with strangers and 'tu' only with friends",
    ],
    dining: [
      "Bread goes directly on the table, not on the plate",
      "Never split the bill — one person pays, you alternate",
    ],
    conversation: [
      "Avoid discussing money or salary — considered very private",
      "French appreciate intellectual debate — it's not arguing",
    ],
  },
  de: {
    greetings: [
      "Use 'Sie' (formal you) unless explicitly invited to use 'du'",
      "Handshakes are standard greeting in business settings",
    ],
    conversation: [
      "Directness is valued — it's not rudeness",
      "Punctuality is extremely important in Germany",
    ],
  },
};

export async function POST(req: NextRequest) {
  try {
    const { text, partnerLang, context } = (await req.json()) as {
      text: string;
      partnerLang: string;
      context?: string;
    };

    if (!partnerLang) {
      return NextResponse.json({ tip: null });
    }

    const lang = partnerLang.split("-")[0]; // "es-CO" -> "es"
    const tips = CULTURAL_TIPS[lang];

    if (!tips) {
      return NextResponse.json({ tip: null });
    }

    // Simple keyword matching to find relevant tips
    const lowerText = (text || "").toLowerCase();
    const lowerContext = (context || "").toLowerCase();

    let relevantTips: string[] = [];

    if (lowerText.includes("hello") || lowerText.includes("hi") || lowerText.includes("hola") || lowerText.includes("greet")) {
      relevantTips = tips.greetings || [];
    } else if (lowerText.includes("food") || lowerText.includes("eat") || lowerText.includes("restaurant") || lowerText.includes("comer") || lowerText.includes("bill") || lowerText.includes("cuenta")) {
      relevantTips = tips.dining || [];
    } else if (lowerText.includes("late") || lowerText.includes("time") || lowerText.includes("hora") || lowerText.includes("wait")) {
      relevantTips = tips.time || [];
    } else if (lowerContext === "call_start") {
      relevantTips = tips.greetings || [];
    } else {
      relevantTips = tips.conversation || [];
    }

    if (relevantTips.length === 0) {
      return NextResponse.json({ tip: null });
    }

    // Return a random relevant tip
    const tip = relevantTips[Math.floor(Math.random() * relevantTips.length)];

    return NextResponse.json({ tip, lang });
  } catch {
    return NextResponse.json({ tip: null });
  }
}
