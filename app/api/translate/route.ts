import { NextRequest, NextResponse } from "next/server";

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK ULTRA-FAST TRANSLATION API
// Optimized for real-time live translation - sub-200ms response times
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

// CORS - restricted to production domains + extension
const ALLOWED_ORIGINS = [
  "https://voxbridge-kappa.vercel.app",
  "https://voxlink-v14.vercel.app",
  "chrome-extension://", // Browser extension
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  // Allow localhost in development
  if (process.env.NODE_ENV === "development" && origin?.includes("localhost")) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }
  // Allow production domains and browser extension
  const isAllowed =
    origin && ALLOWED_ORIGINS.some((allowed) => origin.startsWith(allowed));
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// Handle CORS preflight
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return NextResponse.json({}, { headers: getCorsHeaders(origin) });
}

// Aggressive caching for instant responses
const cache = new Map<string, { value: string; timestamp: number }>();
const MAX_CACHE_SIZE = 2000;
const CACHE_TTL = 3600000; // 1 hour

// Rate limiting
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 120; // Increased for live translation

function getCached(key: string): string | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }
  return null;
}

function setCache(key: string, value: string) {
  cache.set(key, { value, timestamp: Date.now() });
  // Cleanup if too large
  if (cache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );
    for (let i = 0; i < entries.length * 0.3; i++) {
      cache.delete(entries[i][0]);
    }
  }
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);
  if (!record || now > record.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (record.count >= MAX_REQUESTS_PER_MINUTE) return false;
  record.count++;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSTANT DICTIONARY - Zero latency for common phrases
// ═══════════════════════════════════════════════════════════════════════════════

const PHRASES: Record<string, Record<string, string>> = {
  "en-es": {
    // Greetings
    hello: "hola",
    hi: "hola",
    hey: "oye",
    "hi there": "hola",
    "good morning": "buenos días",
    "good afternoon": "buenas tardes",
    "good evening": "buenas noches",
    "good night": "buenas noches",
    "how are you": "cómo estás",
    "how are you doing": "cómo te va",
    "how's it going": "qué tal",
    "what's up": "qué pasa",

    // Farewells
    goodbye: "adiós",
    bye: "adiós",
    "bye bye": "adiós",
    "see you": "nos vemos",
    "see you later": "hasta luego",
    "see you soon": "hasta pronto",
    "take care": "cuídate",

    // Courtesy
    "thank you": "gracias",
    thanks: "gracias",
    "thank you very much": "muchas gracias",
    "thanks a lot": "muchas gracias",
    please: "por favor",
    "you're welcome": "de nada",
    "no problem": "no hay problema",
    sorry: "lo siento",
    "excuse me": "disculpe",
    pardon: "perdón",

    // Basic responses
    yes: "sí",
    no: "no",
    okay: "está bien",
    ok: "está bien",
    "of course": "por supuesto",
    sure: "claro",
    maybe: "quizás",
    "i understand": "entiendo",
    "i don't understand": "no entiendo",
    "can you repeat": "puede repetir",
    "can you repeat that": "puede repetir eso",
    "i don't know": "no sé",
    "i think so": "creo que sí",

    // Introductions
    "nice to meet you": "mucho gusto",
    "pleased to meet you": "encantado",
    "my name is": "me llamo",
    "what is your name": "cómo te llamas",
    "what's your name": "cómo te llamas",
    "where are you from": "de dónde eres",
    "i am from": "soy de",
    "i'm from": "soy de",

    // Questions
    what: "qué",
    where: "dónde",
    when: "cuándo",
    why: "por qué",
    how: "cómo",
    who: "quién",
    which: "cuál",
    "how much": "cuánto",
    "how much is it": "cuánto cuesta",
    "how many": "cuántos",
    "what time is it": "qué hora es",
    "where is": "dónde está",
    "what is this": "qué es esto",
    "do you speak english": "hablas inglés",

    // Needs & Wants
    "i want": "quiero",
    "i need": "necesito",
    "i would like": "me gustaría",
    "i need help": "necesito ayuda",
    "help me": "ayúdame",
    help: "ayuda",
    "can i have": "puedo tener",
    "can you help me": "puedes ayudarme",

    // Common words
    water: "agua",
    food: "comida",
    bathroom: "baño",
    hotel: "hotel",
    restaurant: "restaurante",
    hospital: "hospital",
    police: "policía",
    doctor: "médico",
    money: "dinero",
    "the bill please": "la cuenta por favor",
    menu: "menú",

    // Time
    today: "hoy",
    tomorrow: "mañana",
    yesterday: "ayer",
    now: "ahora",
    later: "después",
    soon: "pronto",
    morning: "mañana",
    afternoon: "tarde",
    night: "noche",

    // Emotions & Descriptions
    "i love you": "te quiero",
    "i like it": "me gusta",
    "i don't like it": "no me gusta",
    good: "bueno",
    bad: "malo",
    "very good": "muy bueno",
    great: "genial",
    beautiful: "hermoso",
    delicious: "delicioso",
    perfect: "perfecto",
    happy: "feliz",
    sad: "triste",
    tired: "cansado",

    // Directions
    left: "izquierda",
    right: "derecha",
    straight: "recto",
    here: "aquí",
    there: "allí",
    near: "cerca",
    far: "lejos",

    // Numbers
    one: "uno",
    two: "dos",
    three: "tres",
    four: "cuatro",
    five: "cinco",
    six: "seis",
    seven: "siete",
    eight: "ocho",
    nine: "nueve",
    ten: "diez",
  },
  "es-en": {
    // Auto-generate reverse mappings
  },
};

// Generate reverse mappings
for (const [phrase, translation] of Object.entries(PHRASES["en-es"])) {
  PHRASES["es-en"][translation] = phrase;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSLATION APIS - Optimized for speed (2s timeout, parallel execution)
// ═══════════════════════════════════════════════════════════════════════════════

const FAST_TIMEOUT = 2000; // 2 seconds max for real-time

// Google Translate Direct - FASTEST, most accurate
async function translateGoogle(
  text: string,
  from: string,
  to: string,
): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(FAST_TIMEOUT),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data[0].map((item: any) => item[0]).join("");
    }
    return null;
  } catch {
    return null;
  }
}

// MyMemory - Fast, reliable
async function translateMyMemory(
  text: string,
  from: string,
  to: string,
): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}&de=voxlink@machinemind.app`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FAST_TIMEOUT) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText;
      if (
        translated.toUpperCase().includes("INVALID") ||
        translated.toUpperCase().includes("LIMIT")
      )
        return null;
      return translated;
    }
    return null;
  } catch {
    return null;
  }
}

// LibreTranslate - Backup
async function translateLibre(
  text: string,
  from: string,
  to: string,
): Promise<string | null> {
  const instances = [
    "https://translate.fedilab.app",
    "https://translate.adminforge.de",
  ];
  for (const instance of instances) {
    try {
      const res = await fetch(`${instance}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: text,
          source: from,
          target: to,
          format: "text",
        }),
        signal: AbortSignal.timeout(FAST_TIMEOUT),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.translatedText) return data.translatedText;
    } catch {
      continue;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TRANSLATION HANDLER
// ═══════════════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Rate limiting
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { translation: "", error: "Rate limit" },
      { status: 429, headers: corsHeaders },
    );
  }

  try {
    const { text, sourceLang, targetLang } = await req.json();

    // Validation
    if (!text || typeof text !== "string") {
      return NextResponse.json({ translation: "" }, { headers: corsHeaders });
    }

    // Input length validation - prevent DoS with massive payloads
    const MAX_TEXT_LENGTH = 5000;
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { translation: "", error: "Text too long (max 5000 chars)" },
        { status: 400, headers: corsHeaders },
      );
    }

    const cleanText = text.trim();
    if (!cleanText || sourceLang === targetLang) {
      return NextResponse.json(
        { translation: cleanText },
        { headers: corsHeaders },
      );
    }

    // Normalize language codes
    const from = sourceLang === "en" ? "en" : "es";
    const to = targetLang === "en" ? "en" : "es";
    const langPair = `${from}-${to}`;

    // 1. Check cache first (INSTANT)
    const cacheKey = `${langPair}:${cleanText.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(
        {
          translation: cached,
          source: "cache",
          latency: Date.now() - startTime,
        },
        { headers: corsHeaders },
      );
    }

    // 2. Dictionary lookup (INSTANT)
    const dictResult = PHRASES[langPair]?.[cleanText.toLowerCase()];
    if (dictResult) {
      setCache(cacheKey, dictResult);
      return NextResponse.json(
        {
          translation: dictResult,
          source: "dictionary",
          latency: Date.now() - startTime,
        },
        { headers: corsHeaders },
      );
    }

    // 3. Partial phrase matching for compound sentences
    const words = cleanText.toLowerCase().split(/\s+/);
    if (words.length <= 3) {
      const partial = PHRASES[langPair]?.[words.join(" ")];
      if (partial) {
        setCache(cacheKey, partial);
        return NextResponse.json(
          {
            translation: partial,
            source: "dictionary",
            latency: Date.now() - startTime,
          },
          { headers: corsHeaders },
        );
      }
    }

    // 4. API Translation - Run Google + MyMemory in PARALLEL for speed
    const [googleResult, myMemoryResult] = await Promise.allSettled([
      translateGoogle(cleanText, from, to),
      translateMyMemory(cleanText, from, to),
    ]);

    let translation: string | null = null;
    let source = "api";

    // Prefer Google (most accurate), fall back to MyMemory
    if (googleResult.status === "fulfilled" && googleResult.value) {
      translation = googleResult.value;
      source = "google";
    } else if (myMemoryResult.status === "fulfilled" && myMemoryResult.value) {
      translation = myMemoryResult.value;
      source = "mymemory";
    }

    // 5. Fallback to LibreTranslate if both failed
    if (!translation) {
      translation = await translateLibre(cleanText, from, to);
      if (translation) source = "libre";
    }

    // 6. Final result
    const finalTranslation = translation || cleanText;

    // Cache successful translations
    if (translation) {
      setCache(cacheKey, finalTranslation);
    }

    return NextResponse.json(
      {
        translation: finalTranslation,
        source: translation ? source : "passthrough",
        latency: Date.now() - startTime,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { translation: "", error: "Failed" },
      { status: 500, headers: corsHeaders },
    );
  }
}

// GET endpoint for testing
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text");
  const from = searchParams.get("from") || "en";
  const to = searchParams.get("to") || "es";

  if (!text) {
    return NextResponse.json(
      { error: "Missing text" },
      { status: 400, headers: corsHeaders },
    );
  }

  return POST(
    new NextRequest(req.url, {
      method: "POST",
      body: JSON.stringify({ text, sourceLang: from, targetLang: to }),
      headers: { "Content-Type": "application/json", Origin: origin || "" },
    }),
  );
}
