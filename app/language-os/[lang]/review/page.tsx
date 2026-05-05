"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import { LangTTS } from "@/app/lib/language-os/tts";
import { getLanguageConfig } from "@/app/lib/language-os/engine";
import type { SRSCard } from "@/app/lib/language-os/types";

export default function SRSReviewPage() {
  const params = useParams();
  const router = useRouter();
  const lang = params.lang as string;
  const config = getLanguageConfig(lang);

  const [cards, setCards] = useState<SRSCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(0);
  const [done, setDone] = useState(false);

  const ttsRef = useRef<LangTTS | null>(null);
  const userIdRef = useRef("");

  useEffect(() => {
    if (!config) {
      router.replace("/language-os");
      return;
    }

    userIdRef.current = getDeviceId();
    ttsRef.current = new LangTTS(config.targetLocale);

    fetch(`/api/language-os/srs?userId=${userIdRef.current}&languagePair=${lang}&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        setCards(data.cards || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => { ttsRef.current?.stop(); };
  }, [lang, config, router]);

  const currentCard = cards[currentIndex];

  const handleReview = async (quality: 0 | 1 | 2 | 3 | 4 | 5) => {
    if (!currentCard) return;

    // Optimistic: move to next card
    setFlipped(false);
    setReviewed((prev) => prev + 1);

    if (currentIndex + 1 >= cards.length) {
      setDone(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }

    // Sync to server (fire and forget)
    fetch("/api/language-os/srs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: currentCard.id,
        quality,
        userId: userIdRef.current,
      }),
    }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#06060a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00C896]/30 border-t-[#00C896] rounded-full animate-spin" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="min-h-screen bg-[#06060a] flex flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl mb-4">🎉</span>
        <h2 className="text-white text-xl font-semibold">No reviews due!</h2>
        <p className="text-white/40 text-sm mt-2">Come back tomorrow for more practice.</p>
        <button
          onClick={() => router.push(`/language-os/${lang}`)}
          className="mt-6 px-6 py-3 rounded-xl text-sm font-medium bg-[#00C896]/15 text-[#00C896] border border-[#00C896]/30"
        >
          Back to Practice
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-[#06060a] flex flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl mb-4">✅</span>
        <h2 className="text-white text-xl font-semibold">Session Complete!</h2>
        <p className="text-white/40 text-sm mt-2">{reviewed} cards reviewed</p>
        <button
          onClick={() => router.push(`/language-os/${lang}`)}
          className="mt-6 px-6 py-3 rounded-xl text-sm font-medium bg-[#00C896]/15 text-[#00C896] border border-[#00C896]/30"
        >
          Back to Practice
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06060a] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button onClick={() => router.push(`/language-os/${lang}`)} className="text-white/50 p-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <span className="text-white text-sm">{currentIndex + 1} / {cards.length}</span>
        </div>
        <div className="w-10" />
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-white/5">
        <div
          className="h-full bg-[#00C896] transition-all duration-300"
          style={{ width: `${(currentIndex / cards.length) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div
          onClick={() => !flipped && setFlipped(true)}
          className="w-full max-w-sm aspect-[3/4] cursor-pointer perspective-1000"
        >
          <div
            className={`relative w-full h-full transition-transform duration-300 preserve-3d ${flipped ? "rotate-y-180" : ""}`}
            style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "" }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-2xl backface-hidden"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", backfaceVisibility: "hidden" }}
            >
              <p className="text-white text-2xl font-semibold text-center">{currentCard?.front}</p>
              <p className="text-white/20 text-xs mt-8">Tap to reveal</p>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-2xl"
              style={{ background: "rgba(0,200,150,0.03)", border: "1px solid rgba(0,200,150,0.15)", backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <p className="text-[#00C896] text-2xl font-semibold text-center">{currentCard?.back}</p>
              {currentCard?.phonetic && (
                <p className="text-white/30 text-sm mt-2 italic">{currentCard.phonetic}</p>
              )}
              {currentCard?.exampleSentence && (
                <p className="text-white/40 text-xs mt-4 text-center italic">{currentCard.exampleSentence}</p>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); ttsRef.current?.speak(currentCard?.audioText || currentCard?.front || ""); }}
                className="mt-4 p-3 bg-white/5 rounded-full text-white/40 hover:text-white/70"
              >
                🔊
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Review buttons */}
      {flipped && (
        <div className="p-4 border-t border-white/5">
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => handleReview(0)}
              className="py-3 rounded-xl text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20"
            >
              Again
            </button>
            <button
              onClick={() => handleReview(3)}
              className="py-3 rounded-xl text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
            >
              Hard
            </button>
            <button
              onClick={() => handleReview(4)}
              className="py-3 rounded-xl text-xs font-medium bg-[#00C896]/10 text-[#00C896] border border-[#00C896]/20"
            >
              Good
            </button>
            <button
              onClick={() => handleReview(5)}
              className="py-3 rounded-xl text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20"
            >
              Easy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
