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
      <div className="min-h-[100dvh] bg-[#06060a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00C896]/30 border-t-[#00C896] rounded-full animate-spin" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-[#06060a] flex flex-col items-center justify-center p-6 text-center">
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
      <div className="min-h-[100dvh] bg-[#06060a] flex flex-col items-center justify-center p-6 text-center">
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
    <div className="min-h-[100dvh] bg-[#06060a] flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-10 blur-[120px]" style={{ background: flipped ? "radial-gradient(circle, rgba(0,200,150,0.5) 0%, transparent 70%)" : "radial-gradient(circle, rgba(100,100,255,0.3) 0%, transparent 70%)", transition: "background 0.5s ease" }} />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button onClick={() => router.push(`/language-os/${lang}`)} className="text-white/50 hover:text-white/80 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl active:scale-95 transition-all hover:bg-white/[0.06]">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <span className="text-white/80 text-sm font-semibold tracking-tight">{currentIndex + 1} <span className="text-white/30">of</span> {cards.length}</span>
        </div>
        <div className="w-11" />
      </header>

      {/* Progress bar */}
      <div className="relative z-10 h-0.5 bg-white/[0.06] mx-4 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(currentIndex / cards.length) * 100}%`, background: "linear-gradient(90deg, #00C896, #00B4D8)" }}
        />
      </div>

      {/* Card */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-6">
        <div
          onClick={() => !flipped && setFlipped(true)}
          className="w-full max-w-sm aspect-[3/4] cursor-pointer"
        >
          <div
            className={`relative w-full h-full transition-transform duration-500 ease-out`}
            style={{ transformStyle: "preserve-3d", transform: flipped ? "rotateY(180deg)" : "" }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-3xl"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
                backfaceVisibility: "hidden",
              }}
            >
              <p className="text-white text-2xl sm:text-3xl font-bold text-center tracking-tight">{currentCard?.front}</p>
              <div className="mt-10 flex items-center gap-2">
                <div className="w-8 h-[1px] bg-white/10" />
                <p className="text-white/25 text-xs">tap to reveal</p>
                <div className="w-8 h-[1px] bg-white/10" />
              </div>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-8 rounded-3xl"
              style={{
                background: "linear-gradient(135deg, rgba(0,200,150,0.06) 0%, rgba(0,200,150,0.02) 100%)",
                border: "1px solid rgba(0,200,150,0.2)",
                boxShadow: "0 8px 40px rgba(0,200,150,0.1), inset 0 1px 0 rgba(0,200,150,0.1)",
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <p className="text-[#00C896] text-2xl sm:text-3xl font-bold text-center tracking-tight">{currentCard?.back}</p>
              {currentCard?.phonetic && (
                <p className="text-white/30 text-sm mt-3 italic">{currentCard.phonetic}</p>
              )}
              {currentCard?.exampleSentence && (
                <p className="text-white/40 text-xs mt-4 text-center italic leading-relaxed max-w-[240px]">{currentCard.exampleSentence}</p>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); ttsRef.current?.speak(currentCard?.audioText || currentCard?.front || ""); }}
                className="mt-6 w-12 h-12 flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] rounded-full text-white/50 hover:text-white transition-all active:scale-90 border border-white/[0.08]"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.8l5-3.5v13.4l-5-3.5H4a1 1 0 01-1-1v-4.4a1 1 0 011-1h2.5z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Review buttons */}
      {flipped && (
        <div className="relative z-10 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-4 gap-2.5">
            <button
              onClick={() => handleReview(0)}
              className="min-h-[52px] py-3.5 rounded-2xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 active:scale-90 transition-all hover:bg-red-500/15"
              style={{ boxShadow: "0 2px 12px rgba(239,68,68,0.1)" }}
            >
              Again
            </button>
            <button
              onClick={() => handleReview(3)}
              className="min-h-[52px] py-3.5 rounded-2xl text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 active:scale-90 transition-all hover:bg-amber-500/15"
              style={{ boxShadow: "0 2px 12px rgba(245,158,11,0.1)" }}
            >
              Hard
            </button>
            <button
              onClick={() => handleReview(4)}
              className="min-h-[52px] py-3.5 rounded-2xl text-xs font-semibold bg-[#00C896]/10 text-[#00C896] border border-[#00C896]/20 active:scale-90 transition-all hover:bg-[#00C896]/15"
              style={{ boxShadow: "0 2px 12px rgba(0,200,150,0.1)" }}
            >
              Good
            </button>
            <button
              onClick={() => handleReview(5)}
              className="min-h-[52px] py-3.5 rounded-2xl text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 active:scale-90 transition-all hover:bg-blue-500/15"
              style={{ boxShadow: "0 2px 12px rgba(59,130,246,0.1)" }}
            >
              Easy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
