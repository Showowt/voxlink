import { NextRequest, NextResponse } from "next/server";
import { losClient } from "@/app/lib/language-os/supabase-client";
import { calculateSM2 } from "@/app/lib/language-os/algorithms/sm2";
import type { SRSCard } from "@/app/lib/language-os/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const languagePair = req.nextUrl.searchParams.get("languagePair");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "10");

  if (!userId || !languagePair) {
    return NextResponse.json({ cards: [], total_due: 0 });
  }

  if (!losClient) {
    return NextResponse.json({ cards: [], total_due: 0 });
  }

  try {
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await losClient
      .from("los_srs_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("language_pair", languagePair)
      .lte("next_review_date", today)
      .order("next_review_date", { ascending: true })
      .limit(limit);

    if (error) {
      return NextResponse.json({ cards: [], total_due: 0 });
    }

    const cards: SRSCard[] = (data || []).map((row) => ({
      id: row.id,
      front: row.front,
      back: row.back,
      phonetic: row.phonetic,
      exampleSentence: row.example_sentence,
      audioText: row.audio_text || row.front,
      cardType: row.card_type,
      source: row.source,
      easeFactor: row.ease_factor,
      intervalDays: row.interval_days,
      repetitions: row.repetitions,
      nextReviewDate: row.next_review_date,
      lastReviewedAt: row.last_reviewed_at,
      totalReviews: row.total_reviews,
      correctReviews: row.correct_reviews,
    }));

    // Get total due count
    const { count } = await losClient
      .from("los_srs_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("language_pair", languagePair)
      .lte("next_review_date", today);

    return NextResponse.json({ cards, total_due: count || cards.length });
  } catch (err) {
    console.error("[LangOS SRS GET]", err);
    return NextResponse.json({ cards: [], total_due: 0 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { cardId, quality, userId } = await req.json();

    if (!cardId || quality === undefined || !userId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    if (!losClient) {
      // Calculate SM2 locally and return
      const result = calculateSM2({
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 0,
        quality,
      });
      return NextResponse.json({
        nextReviewDate: result.nextReviewDate,
        intervalDays: result.intervalDays,
        message: result.intervalDays === 1 ? "See you tomorrow" : `See you in ${result.intervalDays} days`,
      });
    }

    // Get current card
    const { data: card } = await losClient
      .from("los_srs_cards")
      .select("*")
      .eq("id", cardId)
      .single();

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Calculate new SM2 values
    const result = calculateSM2({
      easeFactor: card.ease_factor || 2.5,
      intervalDays: card.interval_days || 1,
      repetitions: card.repetitions || 0,
      quality,
    });

    // Update card
    await losClient
      .from("los_srs_cards")
      .update({
        ease_factor: result.easeFactor,
        interval_days: result.intervalDays,
        repetitions: result.repetitions,
        next_review_date: result.nextReviewDate,
        last_reviewed_at: new Date().toISOString(),
        total_reviews: (card.total_reviews || 0) + 1,
        correct_reviews: (card.correct_reviews || 0) + (quality >= 3 ? 1 : 0),
      })
      .eq("id", cardId);

    const message =
      result.intervalDays === 1
        ? "See you tomorrow"
        : result.intervalDays < 7
          ? `See you in ${result.intervalDays} days`
          : `See you in ${Math.round(result.intervalDays / 7)} weeks`;

    return NextResponse.json({
      nextReviewDate: result.nextReviewDate,
      intervalDays: result.intervalDays,
      message,
    });
  } catch (err) {
    console.error("[LangOS SRS POST]", err);
    return NextResponse.json({ nextReviewDate: "", intervalDays: 1, message: "Saved locally" });
  }
}
