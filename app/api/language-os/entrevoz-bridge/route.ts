import { NextRequest, NextResponse } from "next/server";
import { losClient } from "@/app/lib/language-os/supabase-client";
import { getInitialCard } from "@/app/lib/language-os/algorithms/sm2";

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

export const dynamic = "force-dynamic";

async function translateWord(word: string, from: string, to: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(word)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = await res.json() as Array<Array<Array<string>>>;
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const result = data[0].map((item) => item[0]).join("").trim();
      // Reject if translation came back identical to the source word (unsupported pair or error)
      if (result.toLowerCase() === word.toLowerCase()) return null;
      return result || null;
    }
    return null;
  } catch {
    return null;
  }
}

// Common stop words to filter out
const STOP_WORDS = new Set([
  "el", "la", "los", "las", "un", "una", "de", "en", "que", "y", "a",
  "es", "se", "no", "si", "por", "con", "para", "su", "al", "del",
  "lo", "como", "mas", "pero", "sus", "le", "ya", "o", "fue", "este",
  "ha", "yo", "me", "mi", "tu", "te", "nos", "les", "muy", "the",
  "is", "a", "to", "and", "of", "in", "it", "that", "was", "for",
]);

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!checkLimit(ip, 30)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const body = await req.json();

    // Support two payload formats:
    // 1. PostCallSummary: { words, sourceLang, targetLang, deviceId }
    // 2. Original: { userId, languagePair, transcript, conversationId, durationSeconds }
    if (body.words && body.sourceLang && body.targetLang) {
      // PostCallSummary format — simplified word import
      const { words, sourceLang, targetLang, deviceId } = body as {
        words: string[];
        sourceLang: string;
        targetLang: string;
        deviceId: string;
      };

      const userId = deviceId || "anonymous";
      const languagePair = `${sourceLang}-${targetLang}`;
      const wordsToProcess = (words || [])
        .filter((w: string) => typeof w === "string" && w.length >= 2)
        .slice(0, 10);

      if (wordsToProcess.length === 0) {
        return NextResponse.json({ wordsImported: 0, cardsCreated: 0, sampleWords: [] });
      }

      // Translate all words
      const translationResults = await Promise.allSettled(
        wordsToProcess.map((word: string) => translateWord(word, targetLang, sourceLang))
      );

      const translatedWords: Map<string, string> = new Map();
      for (let i = 0; i < wordsToProcess.length; i++) {
        const result = translationResults[i];
        if (result.status === "fulfilled" && result.value) {
          translatedWords.set(wordsToProcess[i], result.value);
        }
      }

      let cardsCreated = 0;
      const sampleWords: string[] = [];

      if (losClient) {
        const sm2Defaults = getInitialCard();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        for (const word of wordsToProcess) {
          const translation = translatedWords.get(word);
          if (!translation) continue;

          try {
            const { error } = await losClient.from("los_srs_cards").insert({
              user_id: userId,
              language_pair: languagePair,
              front: word,
              back: translation,
              audio_text: word,
              card_type: "vocab",
              source: "conversation",
              ease_factor: sm2Defaults.easeFactor,
              interval_days: sm2Defaults.intervalDays,
              repetitions: sm2Defaults.repetitions,
              next_review_date: tomorrow.toISOString().split("T")[0],
            });

            if (!error) {
              cardsCreated++;
              if (sampleWords.length < 3) sampleWords.push(word);
            }
          } catch {
            // Continue on individual card failure
          }
        }
      }

      return NextResponse.json({
        wordsImported: translatedWords.size,
        cardsCreated,
        sampleWords,
      });
    }

    // Original format
    const { userId, languagePair, transcript, conversationId, durationSeconds } = body;

    if (!userId || !languagePair || !transcript) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Idempotency check
    if (conversationId && losClient) {
      const { data: existing } = await losClient
        .from("los_entrevoz_imports")
        .select("id")
        .eq("user_id", userId)
        .eq("entrevoz_conversation_id", conversationId)
        .single();

      if (existing) {
        return NextResponse.json({ wordsImported: 0, cardsCreated: 0, sampleWords: [], message: "Already imported" });
      }
    }

    // Extract target language from pair (e.g., "en-es-CO" → "es")
    const targetLang = languagePair.split("-")[1] || "es";

    // Extract unique words from partner messages in target language
    const partnerMessages = (transcript as Array<{ text: string; language: string }>)
      .filter((m) => m.language?.startsWith(targetLang))
      .map((m) => m.text);

    const allWords = partnerMessages
      .join(" ")
      .toLowerCase()
      .replace(/[^a-zA-Z\u00C0-\u024F\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

    // Unique words
    const uniqueWords = Array.from(new Set(allWords)).slice(0, 20);

    if (uniqueWords.length === 0) {
      return NextResponse.json({ wordsImported: 0, cardsCreated: 0, sampleWords: [] });
    }

    // Determine translation direction: foreign word (targetLang) → user's native language
    const nativeLang = languagePair.split("-")[0] || "en";

    // Translate all candidate words in parallel before inserting cards
    const wordsToProcess = uniqueWords.slice(0, 10);

    const translationResults = await Promise.allSettled(
      wordsToProcess.map((word) => translateWord(word, targetLang, nativeLang))
    );

    // Build a map of word → translation, skipping any that failed
    const translatedWords: Map<string, string> = new Map();
    for (let i = 0; i < wordsToProcess.length; i++) {
      const result = translationResults[i];
      if (result.status === "fulfilled" && result.value) {
        translatedWords.set(wordsToProcess[i], result.value);
      }
    }

    // Create SRS cards for discovered words
    let cardsCreated = 0;
    const sampleWords: string[] = [];
    const sm2Defaults = getInitialCard();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (losClient) {
      for (const word of wordsToProcess) {
        const translation = translatedWords.get(word);
        // Skip words where translation failed — no broken cards
        if (!translation) continue;

        try {
          const { error } = await losClient.from("los_srs_cards").insert({
            user_id: userId,
            language_pair: languagePair,
            front: word,
            back: translation,
            audio_text: word,
            card_type: "vocab",
            source: "conversation",
            ease_factor: sm2Defaults.easeFactor,
            interval_days: sm2Defaults.intervalDays,
            repetitions: sm2Defaults.repetitions,
            next_review_date: tomorrow.toISOString().split("T")[0],
          });

          if (!error) {
            cardsCreated++;
            if (sampleWords.length < 3) sampleWords.push(word);
          }
        } catch {
          // Continue on individual card failure
        }
      }

      if (cardsCreated === 0 && uniqueWords.length > 0) {
        console.error('[LangOS Entrevoz Bridge] All SRS card insertions failed — translation may have returned no results');
        return NextResponse.json({ error: 'All card insertions failed', wordsImported: 0, cardsCreated: 0, sampleWords: [] }, { status: 500 });
      }

      // Record the import
      await losClient.from("los_entrevoz_imports").insert({
        user_id: userId,
        language_pair: languagePair,
        entrevoz_conversation_id: conversationId || null,
        vocab_words: uniqueWords,
        duration_seconds: durationSeconds || 0,
        partner_language: targetLang,
        processed: true,
        srs_cards_created: cardsCreated,
      });

      // Update progress
      await losClient
        .from("language_os_progress")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("language_pair", languagePair);
    }

    return NextResponse.json({
      wordsImported: uniqueWords.length,
      cardsCreated,
      sampleWords,
    });
  } catch (err) {
    console.error("[LangOS Entrevoz Bridge]", err);
    return NextResponse.json({ wordsImported: 0, cardsCreated: 0, sampleWords: [] });
  }
}
