import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, rateLimitHeaders, trackEvent } from "@/lib/rate-limit";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { offlineTranslate } from "@/lib/offline-dictionary";

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
    // Accuracy inputs (optional, backward-compatible). When `context` is
    // present the request takes the context-aware path so translations stop
    // drifting on pronouns / gender / references across turns.
    context: z.array(z.string().max(600)).max(12).optional(),
    glossary: z.array(z.string().max(120)).max(60).optional(),
    register: z.enum(["auto", "formal", "informal"]).optional(),
  })
  .refine(
    (data) => (data.sourceLang && data.targetLang) || (data.from && data.to),
    { message: "Either sourceLang/targetLang or from/to required" },
  );

// CORS - restricted to production domains + extension
const ALLOWED_ORIGINS = [
  "https://www.entrevoz.co",
  "https://entrevoz.co",
  "https://voxlink-v14.vercel.app",
  "https://voxbridge-kappa.vercel.app",
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
// CLAUDE AI TRANSLATION - Bulletproof fallback (never fails silently)
// ═══════════════════════════════════════════════════════════════════════════════

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

async function translateClaude(
  text: string,
  from: string,
  to: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY2 || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Translate the following text from ${LANG_NAMES[from] || from} to ${LANG_NAMES[to] || to}. This is from a live conversation. Return ONLY the translated text — no quotes, no explanation, no extra words.\n\nText: ${text}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.content?.[0]?.text?.trim();
    return content || null;
  } catch {
    return null;
  }
}

// Region labels so the translator honors the target VARIETY (es-CO vs es-ES,
// pt-BR vs pt-PT) instead of collapsing everything to a generic language.
const REGION_NAMES: Record<string, string> = {
  CO: "Colombia", MX: "Mexico", ES: "Spain", AR: "Argentina", CL: "Chile",
  PE: "Peru", US: "United States", GB: "UK", BR: "Brazil", PT: "Portugal",
  FR: "France", CA: "Canada", DE: "Germany", IT: "Italy", CN: "China",
  TW: "Taiwan", JP: "Japan", KR: "Korea", SA: "Saudi Arabia",
};

// Build a human label from a RAW locale ("es-CO" → "Spanish (Colombia)").
function localeLabel(raw: string, base: string): string {
  const name = LANG_NAMES[base] || base;
  const parts = raw.split(/[-_]/);
  const region = parts.length > 1 ? parts[1].toUpperCase() : "";
  return region && REGION_NAMES[region] ? `${name} (${REGION_NAMES[region]})` : name;
}

// Context-aware translation. Uses the recent conversation ONLY to resolve
// pronouns / gender / tense / references — the #1 source of drift — and honors
// an optional glossary (names, terms) and register. Falls back to null so the
// caller can try the fast providers; NEVER returns the source text.
async function translateClaudeContext(
  text: string,
  from: string,
  to: string,
  opts: {
    context?: string[];
    glossary?: string[];
    register?: string;
    fromLabel?: string;
    toLabel?: string;
  },
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY2 || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const fromName = opts.fromLabel || LANG_NAMES[from] || from;
  const toName = opts.toLabel || LANG_NAMES[to] || to;

  const parts: string[] = [
    `You are a live conversation interpreter. Translate the NEW line from ${fromName} to ${toName}.`,
    `Use the recent conversation ONLY to resolve pronouns, gender agreement, tense, and references. Do NOT translate or repeat the earlier lines, and do NOT add anything that is not in the new line.`,
  ];
  if (opts.register === "formal") parts.push("Use a formal register.");
  else if (opts.register === "informal") parts.push("Use an informal, casual register.");
  else parts.push("Match the speaker's tone and register naturally.");
  if (opts.glossary?.length) {
    parts.push(
      `Keep these names/terms exactly and consistent: ${opts.glossary.slice(0, 60).join(", ")}.`,
    );
  }
  if (opts.context?.length) {
    parts.push(
      `Recent conversation (most recent last):\n${opts.context
        .slice(-12)
        .map((l) => `- ${l}`)
        .join("\n")}`,
    );
  }
  parts.push(`New line to translate:\n${text}`);
  parts.push(
    "Return ONLY the translation of the new line — no quotes, no notes, no speaker labels.",
  );

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: parts.join("\n\n") }],
      }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.content?.[0]?.text?.trim();
    return content || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSLATION APIS - Optimized for speed (2s timeout, parallel execution)
// ═══════════════════════════════════════════════════════════════════════════════

const FAST_TIMEOUT = 1000; // 1 second max — abort and fallback if slower

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
      // Reject if MyMemory echoed the input (unsupported language pair).
      // Compare punctuation/whitespace-insensitively — MyMemory often adds a
      // trailing period or tweaks spacing, which defeated an exact match and
      // let untranslated English through labeled as a translation.
      const echoNorm = (s: string) =>
        s
          .trim()
          .toLowerCase()
          .replace(/[\s]+/g, " ")
          .replace(/[.!?¿¡,;:…]+$/g, "");
      if (echoNorm(translated) === echoNorm(text)) return null;
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
      context,
      glossary,
      register,
    } = parsed.data;
    const sourceLangFinal = sourceLang || fromParam || "en";
    const targetLangFinal = targetLang || toParam || "es";
    const hasContext =
      (Array.isArray(context) && context.length > 0) ||
      (Array.isArray(glossary) && glossary.length > 0) ||
      (register && register !== "auto");
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
        lithuanian: "lt",
        lietuviu: "lt",
        danish: "da",
        dansk: "da",
        norwegian: "no",
        norsk: "no",
        malay: "ms",
        filipino: "tl",
        tagalog: "tl",
        auto: "auto",
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

    // 1-3. Fast lookups (cache → dictionary → partial). SKIPPED for
    // context-aware requests: their accuracy depends on the conversation, so a
    // context-free cache/dictionary hit (e.g. "it's beautiful" → masculine
    // default) is exactly the drift we're eliminating.
    const cacheKey = `${langPair}:${cleanText.toLowerCase()}`;
    if (!hasContext) {
      const cached = getCached(cacheKey);
      if (cached) {
        return NextResponse.json(
          { translation: cached, source: "cache", latency: Date.now() - startTime },
          { headers: corsHeaders },
        );
      }

      const dictResult =
        offlineTranslate(cleanText, from, to) ??
        PHRASES[langPair]?.[cleanText.toLowerCase()];
      if (dictResult) {
        setCache(cacheKey, dictResult);
        return NextResponse.json(
          { translation: dictResult, source: "dictionary", latency: Date.now() - startTime },
          { headers: corsHeaders },
        );
      }

      const words = cleanText.toLowerCase().split(/\s+/);
      if (words.length <= 3) {
        const partial =
          offlineTranslate(words.join(" "), from, to) ??
          PHRASES[langPair]?.[words.join(" ")];
        if (partial) {
          setCache(cacheKey, partial);
          return NextResponse.json(
            { translation: partial, source: "dictionary", latency: Date.now() - startTime },
            { headers: corsHeaders },
          );
        }
      }
    }

    // 4. Free providers run concurrently as a fast fallback for BOTH paths.
    const providerBatch = Promise.allSettled([
      withTimeout(translateGoogle(cleanText, from, to), 1500, null),
      withTimeout(translateMyMemory(cleanText, from, to), 1500, null),
      withTimeout(translateLibre(cleanText, from, to), 1500, null),
    ]);

    let translation: string | null = null;
    let source = "api";

    // 5a. Context-aware LLM is AUTHORITATIVE when context/glossary/register is
    // supplied — this is what stops translations from straying across turns.
    // Providers keep running in parallel so a Claude miss costs no extra time.
    if (hasContext) {
      translation = await translateClaudeContext(cleanText, from, to, {
        context,
        glossary,
        register,
        fromLabel: localeLabel(sourceLangFinal, from),
        toLabel: localeLabel(targetLangFinal, to),
      });
      if (translation) source = "claude-context";
    }

    // 5b. Fast providers — preference Google (most accurate) > MyMemory > Libre.
    if (!translation) {
      const [googleResult, myMemoryResult, libreResult] = await providerBatch;
      if (googleResult.status === "fulfilled" && googleResult.value) {
        translation = googleResult.value;
        source = "google";
      } else if (myMemoryResult.status === "fulfilled" && myMemoryResult.value) {
        translation = myMemoryResult.value;
        source = "mymemory";
      } else if (libreResult.status === "fulfilled" && libreResult.value) {
        translation = libreResult.value;
        source = "libre";
      }
    }

    // 5c. Plain Claude as a last resort (skip if we already tried the
    // context-aware Claude, which uses the same model/key).
    if (!translation && !hasContext) {
      translation = await translateClaude(cleanText, from, to);
      if (translation) source = "claude";
    }

    // 6. Final result — NEVER emit the untranslated source as a "translation".
    // On total failure return an empty string + untranslated:true so the client
    // shows nothing instead of the wrong-language text mislabeled as accurate.
    const finalTranslation = translation ?? "";
    const latency = Date.now() - startTime;

    if (!translation) {
      console.warn(`[Translate] ALL providers failed for ${from}->${to}: "${cleanText.slice(0, 50)}..." (${latency}ms)`);
    }

    // Cache successful translations — but never cache a context-aware result
    // under the context-free key (it would poison the fast path).
    if (translation && !hasContext) {
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
        source: translation ? source : "failed",
        untranslated: !translation,
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
