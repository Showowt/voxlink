import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitHeaders, trackEvent } from "@/lib/rate-limit";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK ULTRA-FAST TRANSLATION API
// Optimized for real-time live translation - sub-200ms response times
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

// Zod schema for input validation - supports both param styles
// Old style: sourceLang/targetLang (legacy)
// New style: from/to (useTranscription hook)
const TranslateRequestSchema = z
  .object({
    text: z
      .string()
      .min(1, "Text is required")
      .max(5000, "Text too long (max 5000 chars)"),
    // Support both param styles
    sourceLang: z.string().min(2).max(10).optional(),
    targetLang: z.string().min(2).max(10).optional(),
    from: z.string().min(2).max(10).optional(),
    to: z.string().min(2).max(10).optional(),
  })
  .refine(
    (data) => (data.sourceLang && data.targetLang) || (data.from && data.to),
    { message: "Either sourceLang/targetLang or from/to required" },
  );

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

// Rate limiting config (uses Upstash Redis - see lib/rate-limit.ts)
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

  // Cleanup stale entries by TTL first (prevents memory leak)
  const now = Date.now();
  Array.from(cache.entries()).forEach(([k, v]) => {
    if (now - v.timestamp > CACHE_TTL) {
      cache.delete(k);
    }
  });

  // Then cleanup by size if still too large
  if (cache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(cache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp,
    );
    for (let i = 0; i < entries.length * 0.3; i++) {
      cache.delete(entries[i][0]);
    }
  }
}

// Legacy rate limit function removed - now using lib/rate-limit.ts with Upstash Redis

// Helper to add timeout to promises (prevents hanging on slow APIs)
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
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

const FAST_TIMEOUT = 1500; // 1.5 seconds max for real-time (faster!)

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

  // Rate limiting (uses Upstash Redis in production)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const rateLimit = await checkRateLimit(
    `translate:${ip}`,
    MAX_REQUESTS_PER_MINUTE,
    60000,
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { translation: "", error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { ...corsHeaders, ...rateLimitHeaders(rateLimit) },
      },
    );
  }

  try {
    const body = await req.json();

    // Zod validation
    const parsed = TranslateRequestSchema.safeParse(body);
    if (!parsed.success) {
      const errorMessage = parsed.error.issues[0]?.message || "Invalid request";
      return NextResponse.json(
        { translation: "", error: errorMessage },
        { status: 400, headers: corsHeaders },
      );
    }

    // Support both param styles: sourceLang/targetLang (legacy) or from/to (new)
    const {
      text,
      sourceLang,
      targetLang,
      from: fromParam,
      to: toParam,
    } = parsed.data;
    const sourceLangFinal = sourceLang || fromParam || "en";
    const targetLangFinal = targetLang || toParam || "es";
    const cleanText = text.trim();
    if (!cleanText) {
      return NextResponse.json({ translation: "" }, { headers: corsHeaders });
    }

    // Normalize language codes - support all languages
    // Map BCP-47 codes and common variants to ISO 639-1 codes
    const normalizeLanguage = (lang: string): string => {
      const code = lang.toLowerCase().split("-")[0].split("_")[0];
      const aliases: Record<string, string> = {
        // Original 12
        english: "en",
        spanish: "es",
        espanol: "es",
        french: "fr",
        francais: "fr",
        portuguese: "pt",
        portugues: "pt",
        german: "de",
        deutsch: "de",
        italian: "it",
        italiano: "it",
        chinese: "zh",
        mandarin: "zh",
        japanese: "ja",
        korean: "ko",
        arabic: "ar",
        russian: "ru",
        hindi: "hi",
        // New languages
        dutch: "nl",
        nederlands: "nl",
        polish: "pl",
        polski: "pl",
        turkish: "tr",
        turkce: "tr",
        vietnamese: "vi",
        thai: "th",
        indonesian: "id",
        ukrainian: "uk",
        greek: "el",
        hebrew: "he",
        swedish: "sv",
        svenska: "sv",
        czech: "cs",
        romanian: "ro",
        hungarian: "hu",
        magyar: "hu",
        finnish: "fi",
        suomi: "fi",
        danish: "da",
        dansk: "da",
        norwegian: "no",
        norsk: "no",
        malay: "ms",
        filipino: "tl",
        tagalog: "tl",
      };
      return aliases[code] || code;
    };

    const from = normalizeLanguage(sourceLangFinal);
    const to = normalizeLanguage(targetLangFinal);

    // Skip translation if normalized languages are the same
    if (from === to) {
      return NextResponse.json(
        { translation: cleanText, source: "same-language" },
        { headers: corsHeaders },
      );
    }
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
    // Each translator has 2s timeout to prevent hanging on slow APIs
    const [googleResult, myMemoryResult] = await Promise.allSettled([
      withTimeout(translateGoogle(cleanText, from, to), 2000, null),
      withTimeout(translateMyMemory(cleanText, from, to), 2000, null),
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

    // 5. Fallback to LibreTranslate if both failed (with 2s timeout)
    if (!translation) {
      translation = await withTimeout(
        translateLibre(cleanText, from, to),
        2000,
        null,
      );
      if (translation) source = "libre";
    }

    // 6. Final result
    const finalTranslation = translation || cleanText;
    const latency = Date.now() - startTime;

    // Cache successful translations
    if (translation) {
      setCache(cacheKey, finalTranslation);
    }

    // 7. Track translation analytics (async, non-blocking)
    if (translation && source !== "cache" && source !== "dictionary") {
      // Log to Supabase analytics table (fire-and-forget) - only if configured
      if (isSupabaseConfigured()) {
        void (async () => {
          try {
            await supabase.from("translation_analytics").insert({
              lang_pair: langPair,
              phrase_length: cleanText.length,
              source_provider: source,
              latency_ms: latency,
              back_translation_match: null,
            });
          } catch (err) {
            console.error("[Analytics] Insert failed:", err);
          }
        })();
      }

      // Also track to Redis for real-time dashboards
      void trackEvent("translation", {
        lang_pair: langPair,
        provider: source,
        latency_ms: latency,
        phrase_length: cleanText.length,
      });
    }

    return NextResponse.json(
      {
        translation: finalTranslation,
        translated: finalTranslation, // Alias for useTranscription hook
        original: cleanText,
        from,
        to,
        source: translation ? source : "passthrough",
        latency,
      },
      { headers: { ...corsHeaders, ...rateLimitHeaders(rateLimit) } },
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
