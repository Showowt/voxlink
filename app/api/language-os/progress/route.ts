import { NextRequest, NextResponse } from "next/server";
import { losClient } from "@/app/lib/language-os/supabase-client";
import { calculateFluencyScore } from "@/app/lib/language-os/algorithms/fluency";
import { DEFAULT_PROGRESS, type UserProgress } from "@/app/lib/language-os/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const languagePair = req.nextUrl.searchParams.get("languagePair");

  if (!userId || !languagePair) {
    return NextResponse.json({ ...DEFAULT_PROGRESS, userId: userId || "", languagePair: languagePair || "" });
  }

  if (!losClient) {
    return NextResponse.json({ ...DEFAULT_PROGRESS, userId, languagePair });
  }

  try {
    const { data, error } = await losClient
      .from("language_os_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("language_pair", languagePair)
      .single();

    if (error || !data) {
      return NextResponse.json({ ...DEFAULT_PROGRESS, userId, languagePair });
    }

    const progress: UserProgress = {
      userId: data.user_id,
      languagePair: data.language_pair,
      fluencyScore: data.fluency_score || 0,
      fluencyPoints: data.fluency_points || 0,
      streakDays: data.streak_days || 0,
      lastActiveDate: data.last_active_date || new Date().toISOString().split("T")[0],
      messagesSent: data.messages_sent || 0,
      correctionsReceived: data.corrections_received || 0,
      conversationsStarted: data.conversations_started || 0,
      missionsCompleted: data.missions_completed || 0,
      wordsLearned: data.words_learned || 0,
      errorPatterns: data.error_patterns || {},
      vocabBank: data.vocab_bank || [],
      completedMissions: data.completed_missions || [],
      weeklyStats: data.weekly_stats || [],
      realConversations: data.real_conversations || 0,
      realVocabImports: data.real_vocab_imports || 0,
    };

    return NextResponse.json(progress);
  } catch (err) {
    console.error("[LangOS Progress GET]", err);
    return NextResponse.json({ ...DEFAULT_PROGRESS, userId, languagePair });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, languagePair, delta } = await req.json();

    if (!userId || !languagePair) {
      return NextResponse.json({ success: false, error: "Missing fields" }, { status: 400 });
    }

    if (!losClient) {
      // Can't write without Supabase — return success for client to cache locally
      return NextResponse.json({ success: true, newFluencyScore: 0 });
    }

    // Upsert the progress row
    const { data: existing } = await losClient
      .from("language_os_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("language_pair", languagePair)
      .single();

    if (!existing) {
      // Create new row
      await losClient.from("language_os_progress").insert({
        user_id: userId,
        language_pair: languagePair,
        fluency_points: delta.fluencyPoints || 0,
        messages_sent: delta.messagesSent || 0,
        corrections_received: delta.correctionsReceived || 0,
        words_learned: delta.wordsLearned || 0,
        last_active_date: new Date().toISOString().split("T")[0],
      });

      return NextResponse.json({ success: true, newFluencyScore: 0 });
    }

    // Update existing
    const updates: Record<string, unknown> = {
      last_active_date: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    };

    if (delta.fluencyPoints) {
      updates.fluency_points = (existing.fluency_points || 0) + delta.fluencyPoints;
    }
    if (delta.messagesSent) {
      updates.messages_sent = (existing.messages_sent || 0) + delta.messagesSent;
    }
    if (delta.correctionsReceived) {
      updates.corrections_received = (existing.corrections_received || 0) + delta.correctionsReceived;
    }
    if (delta.wordsLearned) {
      updates.words_learned = (existing.words_learned || 0) + delta.wordsLearned;
    }

    // Recalculate fluency score
    const newFluencyScore = calculateFluencyScore({
      fluencyPoints: (updates.fluency_points as number) || existing.fluency_points || 0,
      wordsLearned: (updates.words_learned as number) || existing.words_learned || 0,
      streakDays: existing.streak_days || 0,
      missionsCompleted: existing.missions_completed || 0,
      errorPatterns: existing.error_patterns || {},
    });
    updates.fluency_score = newFluencyScore;

    // Streak logic
    const lastActive = existing.last_active_date;
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (lastActive === yesterday) {
      updates.streak_days = (existing.streak_days || 0) + 1;
    } else if (lastActive !== today) {
      updates.streak_days = 1;
    }

    await losClient
      .from("language_os_progress")
      .update(updates)
      .eq("user_id", userId)
      .eq("language_pair", languagePair);

    return NextResponse.json({ success: true, newFluencyScore });
  } catch (err) {
    console.error("[LangOS Progress POST]", err);
    return NextResponse.json({ success: true, newFluencyScore: 0 });
  }
}
