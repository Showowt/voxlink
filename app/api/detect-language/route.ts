import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Language detection heuristics — no external API needed
const WORD_MARKERS: Record<string, string[]> = {
  es: ["el", "la", "los", "las", "que", "de", "en", "es", "un", "una", "no", "por", "con", "para", "como", "pero", "muy", "tambien", "donde", "cuando", "estoy", "tengo", "quiero", "puedo"],
  fr: ["le", "la", "les", "des", "que", "est", "pas", "une", "dans", "pour", "avec", "sur", "sont", "mais", "nous", "vous", "ils", "elles", "tres", "aussi", "cette", "comme", "bien", "peut"],
  pt: ["o", "os", "as", "que", "nao", "uma", "com", "para", "por", "mais", "como", "mas", "quando", "muito", "tambem", "pode", "isso", "este", "essa", "aqui", "voce", "tem", "esta"],
  de: ["der", "die", "das", "und", "ist", "ein", "eine", "nicht", "mit", "auf", "den", "dem", "ich", "sie", "wir", "kann", "auch", "noch", "aber", "oder", "wenn", "haben"],
  it: ["il", "lo", "la", "che", "non", "una", "con", "per", "sono", "come", "questo", "quello", "anche", "molto", "bene", "tutto", "dove", "quando", "perche", "posso", "voglio"],
  nl: ["de", "het", "een", "van", "dat", "niet", "zijn", "ook", "maar", "wel", "met", "voor", "nog", "kan", "moet", "waar", "hoe", "wat", "wie", "dit"],
  tr: ["bir", "bu", "ve", "ile", "olan", "icin", "gibi", "daha", "cok", "var", "ben", "sen", "biz", "ama", "nasil", "nerede", "zaman"],
  pl: ["nie", "sie", "jest", "ale", "jak", "tak", "czy", "dla", "tym", "ten", "bardzo", "tutaj", "gdzie", "kiedy", "moze", "jestem"],
  ru: ["и", "в", "не", "он", "на", "я", "что", "это", "как", "мне", "мы", "они", "да", "нет", "был", "все"],
  vi: ["la", "cua", "va", "khong", "co", "trong", "duoc", "cho", "nhu", "toi", "ban", "anh", "chi", "mot", "cac"],
};

// Script-based detection (100% confidence)
function detectByScript(text: string): { language: string; confidence: number } | null {
  // Arabic script
  if (/[\u0600-\u06FF]/.test(text)) return { language: "ar", confidence: 0.99 };
  // Hebrew
  if (/[\u0590-\u05FF]/.test(text)) return { language: "he", confidence: 0.99 };
  // Chinese characters
  if (/[\u4E00-\u9FFF]/.test(text)) return { language: "zh", confidence: 0.95 };
  // Japanese (Hiragana/Katakana)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return { language: "ja", confidence: 0.99 };
  // Korean
  if (/[\uAC00-\uD7AF]/.test(text)) return { language: "ko", confidence: 0.99 };
  // Cyrillic
  if (/[\u0400-\u04FF]/.test(text)) return { language: "ru", confidence: 0.85 }; // Could be Ukrainian
  // Thai
  if (/[\u0E00-\u0E7F]/.test(text)) return { language: "th", confidence: 0.99 };
  // Hindi/Devanagari
  if (/[\u0900-\u097F]/.test(text)) return { language: "hi", confidence: 0.95 };

  return null;
}

// Word frequency detection for Latin scripts
function detectByWords(text: string): { language: string; confidence: number } | null {
  const words = text.toLowerCase().replace(/[^a-zA-Z\u00C0-\u024F\u0400-\u04FF\s]/g, "").split(/\s+/).filter(w => w.length > 0);
  if (words.length < 3) return null;

  const scores: Record<string, number> = {};

  for (const [lang, markers] of Object.entries(WORD_MARKERS)) {
    let matches = 0;
    for (const word of words) {
      if (markers.includes(word)) matches++;
    }
    scores[lang] = matches / words.length;
  }

  // Find highest scoring language
  let bestLang = "en";
  let bestScore = 0;

  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  // If no markers match well, assume English
  if (bestScore < 0.1) {
    return { language: "en", confidence: 0.6 };
  }

  // Confidence based on how many words matched
  const confidence = Math.min(0.95, 0.5 + bestScore);
  return { language: bestLang, confidence };
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese",
  de: "German", it: "Italian", zh: "Chinese", ja: "Japanese",
  ko: "Korean", ar: "Arabic", ru: "Russian", hi: "Hindi",
  nl: "Dutch", pl: "Polish", tr: "Turkish", vi: "Vietnamese",
  th: "Thai", he: "Hebrew", sv: "Swedish",
};

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ language: null, confidence: 0, name: null });
    }

    const trimmed = text.trim();
    if (trimmed.length < 5) {
      return NextResponse.json({ language: null, confidence: 0, name: null });
    }

    // Try script-based detection first (most reliable)
    const scriptResult = detectByScript(trimmed);
    if (scriptResult) {
      return NextResponse.json({
        language: scriptResult.language,
        confidence: scriptResult.confidence,
        name: LANGUAGE_NAMES[scriptResult.language] || scriptResult.language,
      });
    }

    // Fall back to word-frequency analysis
    const wordResult = detectByWords(trimmed);
    if (wordResult && wordResult.confidence > 0.5) {
      return NextResponse.json({
        language: wordResult.language,
        confidence: wordResult.confidence,
        name: LANGUAGE_NAMES[wordResult.language] || wordResult.language,
      });
    }

    // Can't determine
    return NextResponse.json({ language: null, confidence: 0, name: null });
  } catch {
    return NextResponse.json({ language: null, confidence: 0, name: null });
  }
}
