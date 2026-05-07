"use client";

import { useState, useCallback } from "react";

const FEATURE_LEARNING_MODE = true;

interface LearnedWord {
  original: string;
  translation: string;
  lang: string;
  timestamp: number;
  reviewCount: number;
}

interface LearningModeProps {
  enabled: boolean;
  onToggle: () => void;
  partnerLang: string;
  userLang: string;
}

// Storage key
const STORAGE_KEY = "entrevoz_learned_words";

function getStoredWords(): LearnedWord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function storeWord(word: LearnedWord) {
  const words = getStoredWords();
  // Avoid duplicates
  const exists = words.find((w) => w.original === word.original && w.lang === word.lang);
  if (exists) {
    exists.reviewCount++;
    exists.timestamp = Date.now();
  } else {
    words.unshift(word);
  }
  // Keep max 200 words
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words.slice(0, 200)));
}

export function useLearningMode() {
  const [enabled, setEnabled] = useState(false);
  const [savedWords, setSavedWords] = useState<LearnedWord[]>([]);

  const toggle = useCallback(() => {
    setEnabled((v) => !v);
    if (!enabled) {
      setSavedWords(getStoredWords());
    }
  }, [enabled]);

  const saveWord = useCallback((original: string, translation: string, lang: string) => {
    const word: LearnedWord = {
      original,
      translation,
      lang,
      timestamp: Date.now(),
      reviewCount: 1,
    };
    storeWord(word);
    setSavedWords(getStoredWords());
  }, []);

  return { enabled, toggle, savedWords, saveWord };
}

export default function LearningMode({
  enabled,
  onToggle,
  partnerLang,
  userLang,
}: LearningModeProps) {
  const [words] = useState<LearnedWord[]>(() => getStoredWords());
  const [showVocab, setShowVocab] = useState(false);

  if (!FEATURE_LEARNING_MODE) return null;

  return (
    <>
      {/* Toggle button in controls */}
      <button
        onClick={onToggle}
        title="Learning Mode"
        className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-xl transition-all ${
          enabled
            ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
            : "bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </button>

      {/* Vocabulary panel */}
      {enabled && showVocab && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm">
          <div
            className="w-full max-w-sm max-h-[70vh] overflow-hidden mx-4 mb-4 md:mb-0 rounded-2xl flex flex-col"
            style={{
              background: "linear-gradient(180deg, #111114 0%, #0a0a0e 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <h3 className="text-white text-sm font-semibold">
                Vocabulary ({words.length})
              </h3>
              <button
                onClick={() => setShowVocab(false)}
                className="text-white/40 hover:text-white/70 p-2"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {words.length === 0 ? (
                <p className="text-white/40 text-xs text-center py-8">
                  Tap words during a call to save them here
                </p>
              ) : (
                words.slice(0, 50).map((w, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                    <div>
                      <p className="text-white text-sm">{w.original}</p>
                      <p className="text-[#00C896] text-xs">{w.translation}</p>
                    </div>
                    <span className="text-white/20 text-[10px]">×{w.reviewCount}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Indicator badge */}
      {enabled && !showVocab && (
        <button
          onClick={() => setShowVocab(true)}
          className="absolute top-safe left-1 z-30 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30"
          style={{ top: "max(3.5rem, calc(env(safe-area-inset-top) + 2.5rem))" }}
        >
          📖 Learning: ON
        </button>
      )}
    </>
  );
}
