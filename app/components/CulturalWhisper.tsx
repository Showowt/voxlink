"use client";

import { useState, useEffect, useRef } from "react";

const FEATURE_CULTURAL_WHISPERS = true;

interface CulturalWhisperProps {
  partnerLang: string;
  lastPartnerText: string;
  enabled: boolean;
}

export default function CulturalWhisper({
  partnerLang,
  lastPartnerText,
  enabled,
}: CulturalWhisperProps) {
  const [tip, setTip] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const lastFetchRef = useRef("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!FEATURE_CULTURAL_WHISPERS || !enabled || !partnerLang) return;

    // Only fetch when new partner text arrives
    if (!lastPartnerText || lastPartnerText === lastFetchRef.current) return;
    if (lastPartnerText.length < 10) return;

    lastFetchRef.current = lastPartnerText;

    const fetchTip = async () => {
      try {
        const res = await fetch("/api/cultural-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: lastPartnerText, partnerLang }),
        });

        if (!res.ok) return;
        const data = await res.json();

        if (data.tip) {
          setTip(data.tip);
          setVisible(true);

          // Auto-hide after 8 seconds
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            setVisible(false);
          }, 8000);
        }
      } catch {
        // Silent fail
      }
    };

    // Debounce — don't fetch on every word
    const debounce = setTimeout(fetchTip, 2000);
    return () => clearTimeout(debounce);
  }, [lastPartnerText, partnerLang, enabled]);

  if (!FEATURE_CULTURAL_WHISPERS || !enabled || !visible || !tip) return null;

  return (
    <div
      className="flex items-start gap-2 px-3 py-2 rounded-xl text-xs leading-relaxed animate-fade-in"
      style={{
        background: "rgba(139,92,246,0.08)",
        border: "1px solid rgba(139,92,246,0.2)",
      }}
    >
      <span className="shrink-0 mt-0.5">🌎</span>
      <p className="text-purple-200/80">{tip}</p>
      <button
        onClick={() => setVisible(false)}
        className="shrink-0 text-purple-300/40 hover:text-purple-300/70 ml-1"
      >
        ×
      </button>
    </div>
  );
}
