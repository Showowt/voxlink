"use client";

import { useState, useRef, useCallback } from "react";

const FEATURE_AUTO_DETECT = true;

interface DetectionResult {
  language: string;
  confidence: number;
  name: string;
}

interface UseLanguageDetectionReturn {
  detectedLanguage: string | null;
  confidence: number;
  languageName: string | null;
  detect: (text: string) => Promise<DetectionResult | null>;
}

export function useLanguageDetection(): UseLanguageDetectionReturn {
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [languageName, setLanguageName] = useState<string | null>(null);
  const lastDetectedRef = useRef<string>("");

  const detect = useCallback(async (text: string): Promise<DetectionResult | null> => {
    if (!FEATURE_AUTO_DETECT || !text || text.trim().length < 5) return null;

    // Don't re-detect if text is very similar to last detection
    const trimmed = text.trim();
    if (trimmed === lastDetectedRef.current) {
      return detectedLanguage ? { language: detectedLanguage, confidence, name: languageName || "" } : null;
    }

    try {
      const res = await fetch("/api/detect-language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      if (!res.ok) return null;

      const data: DetectionResult = await res.json();

      if (data.language && data.confidence > 0.5) {
        lastDetectedRef.current = trimmed;
        setDetectedLanguage(data.language);
        setConfidence(data.confidence);
        setLanguageName(data.name);
        return data;
      }

      return null;
    } catch {
      return null;
    }
  }, [detectedLanguage, confidence, languageName]);

  return { detectedLanguage, confidence, languageName, detect };
}

export default useLanguageDetection;
