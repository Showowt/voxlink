"use client";

import { useState, useEffect, useRef } from "react";

const FEATURE_BACK_TRANSLATION = true;

interface BackTranslationBadgeProps {
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  visible: boolean;
}

type ConfidenceLevel = "high" | "medium" | "low";

export default function BackTranslationBadge({
  originalText,
  translatedText,
  sourceLang,
  targetLang,
  visible,
}: BackTranslationBadgeProps) {
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [backTranslation, setBackTranslation] = useState("");
  const [showDetail, setShowDetail] = useState(false);
  const lastCheckedRef = useRef("");

  useEffect(() => {
    if (!FEATURE_BACK_TRANSLATION || !visible || !translatedText || !originalText) {
      setConfidence(null);
      return;
    }

    // Only check final translations (skip interims)
    if (translatedText === lastCheckedRef.current) return;
    if (originalText.length < 5) return;

    lastCheckedRef.current = translatedText;

    const checkConfidence = async () => {
      try {
        // Back-translate: translate the translation back to source language
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: translatedText,
            from: targetLang,
            to: sourceLang,
          }),
        });

        if (!res.ok) return;

        const data = await res.json();
        const backText = (data.translated || data.translation || "").toLowerCase().trim();
        const origLower = originalText.toLowerCase().trim();

        setBackTranslation(backText);

        // Calculate similarity
        const similarity = calculateSimilarity(origLower, backText);

        if (similarity > 0.8) {
          setConfidence("high");
        } else if (similarity > 0.5) {
          setConfidence("medium");
        } else {
          setConfidence("low");
        }
      } catch {
        setConfidence(null);
      }
    };

    // Delay to avoid spamming during interim translations
    const timeout = setTimeout(checkConfidence, 500);
    return () => clearTimeout(timeout);
  }, [translatedText, originalText, sourceLang, targetLang, visible]);

  if (!FEATURE_BACK_TRANSLATION || !visible || !confidence) return null;

  const colors: Record<ConfidenceLevel, { bg: string; text: string; border: string; label: string }> = {
    high: { bg: "rgba(0,200,150,0.1)", text: "#00C896", border: "rgba(0,200,150,0.3)", label: "Accurate" },
    medium: { bg: "rgba(245,158,11,0.1)", text: "#f59e0b", border: "rgba(245,158,11,0.3)", label: "Approximate" },
    low: { bg: "rgba(239,68,68,0.1)", text: "#ef4444", border: "rgba(239,68,68,0.3)", label: "Uncertain" },
  };

  const c = colors[confidence];

  return (
    <div className="inline-flex items-center gap-1 mt-1">
      <button
        onClick={() => setShowDetail(!showDetail)}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-all"
        style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.text }} />
        {c.label}
      </button>

      {showDetail && backTranslation && (
        <span className="text-[10px] text-white/40 italic truncate max-w-[150px]">
          ↩ {backTranslation}
        </span>
      )}
    </div>
  );
}

// Levenshtein-based word similarity
function calculateSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const wordsA = a.split(/\s+/).filter(Boolean);
  const wordsB = b.split(/\s+/).filter(Boolean);

  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  // Word overlap ratio
  let matches = 0;
  for (const word of wordsA) {
    if (wordsB.includes(word)) matches++;
  }

  const overlapScore = matches / Math.max(wordsA.length, wordsB.length);

  // Length similarity
  const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);

  return overlapScore * 0.7 + lenRatio * 0.3;
}
