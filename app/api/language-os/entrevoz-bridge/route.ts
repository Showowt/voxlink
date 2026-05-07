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
    const { userId, languagePair, transcript, conversationId, durationSeconds } = await req.json();

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

    // Create SRS cards for discovered words
    let cardsCreated = 0;
    const sampleWords: string[] = [];
    const sm2Defaults = getInitialCard();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (losClient) {
      for (const word of uniqueWords.slice(0, 10)) {
        try {
          const { error } = await losClient.from("los_srs_cards").insert({
            user_id: userId,
            language_pair: languagePair,
            front: word,
            back: word, // Will be enriched later with translations
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
