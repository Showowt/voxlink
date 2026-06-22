"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface LearnedWord {
  original: string;
  translation: string;
  lang: string;
  timestamp: number;
  reviewCount: number;
}

interface ConversationTurn {
  speaker: "me" | "partner";
  original: string;
  translated: string;
  lang: string;
}

interface VocabItem {
  word: string;
  meaning: string;
  type: string;
}

interface LearningInsight {
  keyPhrase: {
    original: string;
    translation: string;
    pronunciation: string;
    context: string;
  } | null;
  correction: {
    userSaid: string;
    betterWay: string | null;
    explanation: string;
  } | null;
  grammarTip: string | null;
  responseHint: string | null;
  vocabWords: VocabItem[];
}

interface LearningModeProps {
  enabled: boolean;
  onToggle: () => void;
  partnerLang: string;
  userLang: string;
  savedWords: LearnedWord[];
}

interface TappableCaptionProps {
  text: string;
  sourceLang: string;
  targetLang: string;
  onWordSaved: (original: string, translation: string, lang: string) => void;
  enabled: boolean;
  className?: string;
}

interface LearningInsightCardProps {
  insight: LearningInsight;
  isLoading: boolean;
  onSaveWord: (original: string, translation: string, lang: string) => void;
  partnerLang: string;
  onDismiss: () => void;
}

// ═══════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════

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
  const exists = words.find((w) => w.original === word.original && w.lang === word.lang);
  if (exists) {
    exists.reviewCount++;
    exists.timestamp = Date.now();
  } else {
    words.unshift(word);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(words.slice(0, 200)));
}

// ═══════════════════════════════════════════════════════════════
// HOOK — useLearningMode
// Manages learning state, conversation tracking, and insights API
// ═══════════════════════════════════════════════════════════════

export function useLearningMode() {
  const [enabled, setEnabled] = useState(false);
  const [savedWords, setSavedWords] = useState<LearnedWord[]>([]);
  const [insight, setInsight] = useState<LearningInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const conversationRef = useRef<ConversationTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const toggle = useCallback(() => {
    setEnabled((v) => {
      if (!v) {
        setSavedWords(getStoredWords());
        conversationRef.current = [];
        setInsight(null);
      }
      return !v;
    });
  }, []);

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

  // Feed a conversation turn and get learning insights
  const addTurn = useCallback((
    speaker: "me" | "partner",
    original: string,
    translated: string,
    lang: string,
    userLang: string,
    partnerLang: string,
  ) => {
    const turn: ConversationTurn = { speaker, original, translated, lang };
    conversationRef.current.push(turn);

    // Auto-save vocab words from partner's speech
    if (speaker === "partner" && translated) {
      // Extract and auto-save notable words (4+ chars, not common)
      const words = original.split(/\s+/).filter((w) => w.replace(/[^\w]/g, "").length >= 4);
      if (words.length > 0) {
        // Save the full phrase as a learned item
        storeWord({
          original,
          translation: translated,
          lang,
          timestamp: Date.now(),
          reviewCount: 1,
        });
        setSavedWords(getStoredWords());
      }
    }

    // Debounce the insights API call (wait 1.5s after last turn)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchInsights(turn, userLang, partnerLang);
    }, 1500);
  }, []);

  const fetchInsights = useCallback(async (
    latestTurn: ConversationTurn,
    userLang: string,
    partnerLang: string,
  ) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInsightLoading(true);
    try {
      const res = await fetch("/api/learning-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation: conversationRef.current.slice(-10),
          userLang,
          partnerLang,
          latestTurn,
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("API error");
      const data = await res.json();

      if (data.insights) {
        setInsight(data.insights);

        // Auto-save vocab words from insights
        if (data.insights.vocabWords) {
          for (const v of data.insights.vocabWords) {
            storeWord({
              original: v.word,
              translation: v.meaning,
              lang: partnerLang,
              timestamp: Date.now(),
              reviewCount: 1,
            });
          }
          setSavedWords(getStoredWords());
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("[LearningMode] Insights fetch failed:", err);
    } finally {
      setInsightLoading(false);
    }
  }, []);

  const dismissInsight = useCallback(() => {
    setInsight(null);
  }, []);

  return {
    enabled,
    toggle,
    savedWords,
    saveWord,
    addTurn,
    insight,
    insightLoading,
    dismissInsight,
  };
}

// ═══════════════════════════════════════════════════════════════
// TAPPABLE CAPTION — tap any word to save it to vocabulary
// ═══════════════════════════════════════════════════════════════

export function TappableCaption({
  text,
  sourceLang,
  targetLang,
  onWordSaved,
  enabled,
  className = "",
}: TappableCaptionProps) {
  const [savingWord, setSavingWord] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleWordTap = useCallback(async (word: string) => {
    const cleaned = word.replace(/^[^\w\u00C0-\u024F]+|[^\w\u00C0-\u024F]+$/g, "");
    if (!cleaned || cleaned.length < 2) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSavingWord(cleaned);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleaned, sourceLang, targetLang }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error("Translation failed");
      const data = await res.json();

      if (data.translation) {
        onWordSaved(cleaned, data.translation, sourceLang);
        setSavedFlash(cleaned);
        setTimeout(() => setSavedFlash(null), 1200);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("[LearningMode] Word translate failed:", err);
    } finally {
      setSavingWord(null);
    }
  }, [sourceLang, targetLang, onWordSaved]);

  if (!enabled) {
    return <span className={className}>{text}</span>;
  }

  const words = text.split(/(\s+)/);

  return (
    <span className={className}>
      {words.map((segment, i) => {
        if (/^\s+$/.test(segment)) {
          return <span key={i}>{segment}</span>;
        }

        const cleaned = segment.replace(/^[^\w\u00C0-\u024F]+|[^\w\u00C0-\u024F]+$/g, "");
        const isSaving = savingWord === cleaned;
        const justSaved = savedFlash === cleaned;

        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleWordTap(segment);
            }}
            className={`inline px-0 py-0 leading-inherit transition-all duration-200 rounded-sm ${
              justSaved
                ? "bg-amber-400/30 text-amber-200"
                : isSaving
                  ? "bg-white/20 animate-pulse"
                  : "hover:bg-white/15 active:bg-amber-400/20 underline decoration-dotted decoration-white/20 underline-offset-2"
            }`}
            style={{ cursor: "pointer", border: "none", background: justSaved ? undefined : isSaving ? undefined : "transparent", font: "inherit", color: "inherit" }}
            title={`Tap to save "${cleaned}"`}
          >
            {segment}
            {justSaved && (
              <span className="ml-0.5 text-amber-400 text-[10px] animate-bounce inline-block">✓</span>
            )}
          </button>
        );
      })}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════
// LEARNING INSIGHT CARD — shows real-time teaching during calls
// ═══════════════════════════════════════════════════════════════

export function LearningInsightCard({
  insight,
  isLoading,
  onSaveWord,
  partnerLang,
  onDismiss,
}: LearningInsightCardProps) {
  const [savedWords, setSavedWords] = useState<Set<string>>(new Set());

  if (isLoading) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-amber-300 text-xs">Analyzing conversation...</span>
        </div>
      </div>
    );
  }

  if (!insight) return null;

  const handleSaveVocab = (word: string, meaning: string) => {
    onSaveWord(word, meaning, partnerLang);
    setSavedWords((prev) => new Set(prev).add(word));
  };

  return (
    <div className="bg-black/90 border border-amber-500/25 rounded-xl overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-500/10 border-b border-amber-500/15">
        <span className="text-amber-400 text-xs font-semibold flex items-center gap-1.5">
          📖 Learning Insight
        </span>
        <button
          onClick={onDismiss}
          className="text-white/30 hover:text-white/60 p-1 min-w-[32px] min-h-[32px] flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      <div className="px-3 py-2 space-y-2.5">
        {/* Key Phrase */}
        {insight.keyPhrase && (
          <div>
            <p className="text-amber-300 text-[10px] uppercase tracking-wider font-semibold mb-1">Key Phrase</p>
            <div className="bg-white/5 rounded-lg px-2.5 py-2">
              <p className="text-white text-sm font-medium">{insight.keyPhrase.original}</p>
              <p className="text-[#00C896] text-xs mt-0.5">{insight.keyPhrase.translation}</p>
              {insight.keyPhrase.pronunciation && (
                <p className="text-white/40 text-[10px] mt-0.5 italic">/{insight.keyPhrase.pronunciation}/</p>
              )}
              {insight.keyPhrase.context && (
                <p className="text-white/50 text-[10px] mt-1">{insight.keyPhrase.context}</p>
              )}
            </div>
          </div>
        )}

        {/* Correction — when user spoke */}
        {insight.correction && (
          <div>
            <p className="text-amber-300 text-[10px] uppercase tracking-wider font-semibold mb-1">
              {insight.correction.betterWay ? "Better Way to Say It" : "Nice!"}
            </p>
            <div className={`rounded-lg px-2.5 py-2 ${insight.correction.betterWay ? "bg-red-500/10 border border-red-500/15" : "bg-emerald-500/10 border border-emerald-500/15"}`}>
              {insight.correction.betterWay ? (
                <>
                  <p className="text-white/50 text-xs line-through">{insight.correction.userSaid}</p>
                  <p className="text-white text-sm font-medium mt-0.5">{insight.correction.betterWay}</p>
                </>
              ) : (
                <p className="text-emerald-300 text-xs">{insight.correction.userSaid}</p>
              )}
              <p className="text-white/60 text-[10px] mt-1">{insight.correction.explanation}</p>
            </div>
          </div>
        )}

        {/* Response Hint — when partner spoke */}
        {insight.responseHint && (
          <div>
            <p className="text-amber-300 text-[10px] uppercase tracking-wider font-semibold mb-1">Try Responding</p>
            <div className="bg-violet-500/10 border border-violet-500/15 rounded-lg px-2.5 py-2">
              <p className="text-violet-200 text-sm">{insight.responseHint}</p>
            </div>
          </div>
        )}

        {/* Grammar Tip */}
        {insight.grammarTip && (
          <div className="bg-blue-500/10 border border-blue-500/15 rounded-lg px-2.5 py-1.5">
            <p className="text-blue-300 text-[10px] font-semibold mb-0.5">Grammar</p>
            <p className="text-white/70 text-xs">{insight.grammarTip}</p>
          </div>
        )}

        {/* Vocabulary */}
        {insight.vocabWords && insight.vocabWords.length > 0 && (
          <div>
            <p className="text-amber-300 text-[10px] uppercase tracking-wider font-semibold mb-1">Vocabulary</p>
            <div className="space-y-1">
              {insight.vocabWords.map((v, i) => (
                <button
                  key={`${v.word}-${i}`}
                  onClick={() => handleSaveVocab(v.word, v.meaning)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 bg-white/5 rounded-lg hover:bg-white/10 transition-all text-left"
                >
                  <div>
                    <span className="text-white text-xs font-medium">{v.word}</span>
                    <span className="text-white/30 text-[10px] ml-1.5">{v.type}</span>
                    <p className="text-[#00C896] text-[10px]">{v.meaning}</p>
                  </div>
                  {savedWords.has(v.word) ? (
                    <span className="text-amber-400 text-xs">✓</span>
                  ) : (
                    <span className="text-white/20 text-[10px]">+save</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LEARNING MODE PANEL + TOGGLE BUTTON
// ═══════════════════════════════════════════════════════════════

export default function LearningMode({
  enabled,
  onToggle,
  savedWords,
}: LearningModeProps) {
  const [showVocab, setShowVocab] = useState(false);
  const words = savedWords.length > 0 ? savedWords : getStoredWords();

  return (
    <>
      {/* Toggle button in controls */}
      <button
        onClick={onToggle}
        title="Learning Mode"
        className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-xl transition-all active:scale-95 relative ${
          enabled
            ? "bg-amber-500/20 text-amber-400 border-[1.5px] border-amber-500/40"
            : "bg-white/10 text-white hover:bg-white/20"
        }`}
        style={enabled ? { boxShadow: "0 0 16px rgba(245,158,11,0.2)" } : undefined}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        {enabled && (
          <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        )}
      </button>

      {/* Vocabulary panel */}
      {enabled && showVocab && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowVocab(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
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
                className="text-white/40 hover:text-white/70 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {words.length === 0 ? (
                <p className="text-white/40 text-xs text-center py-8">
                  Words from your conversations will appear here
                </p>
              ) : (
                words.slice(0, 50).map((w, i) => (
                  <div key={`${w.original}-${w.lang}-${i}`} className="flex items-center justify-between p-2.5 bg-white/5 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-medium truncate">{w.original}</p>
                      <p className="text-[#00C896] text-xs truncate">{w.translation}</p>
                    </div>
                    <span className="text-white/20 text-[10px] ml-2 shrink-0">×{w.reviewCount}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating indicator badge */}
      {enabled && !showVocab && (
        <button
          onClick={() => setShowVocab(true)}
          className="fixed z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30 backdrop-blur-sm active:scale-95 transition-all"
          style={{ top: "max(3.5rem, calc(env(safe-area-inset-top) + 2.5rem))", left: "0.5rem" }}
        >
          📖 Learning{words.length > 0 ? ` (${words.length})` : ""}
        </button>
      )}
    </>
  );
}
