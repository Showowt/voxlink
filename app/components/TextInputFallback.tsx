"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const FEATURE_TEXT_INPUT = true;

interface TextInputFallbackProps {
  visible: boolean;
  onDismiss: () => void;
  sendMessage: (message: string) => boolean;
  sourceLang: string;
  targetLang: string;
}

export default function TextInputFallback({
  visible,
  onDismiss,
  sendMessage,
  sourceLang,
  targetLang,
}: TextInputFallbackProps) {
  const [text, setText] = useState("");
  const [translating, setTranslating] = useState(false);
  const [lastTranslation, setLastTranslation] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input when visible
  useEffect(() => {
    if (visible && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  // Dismiss on Escape
  useEffect(() => {
    if (!visible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, onDismiss]);

  // Dismiss on click outside
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    // Delay to prevent immediate dismiss on open click
    const timeout = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 200);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [visible, onDismiss]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || translating) return;

    setTranslating(true);

    try {
      // Translate
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, sourceLang, targetLang }),
      });

      if (!res.ok) throw new Error("Translation failed");

      const data = await res.json();
      const translated = data.translated || data.translation || trimmed;

      setLastTranslation(translated);

      // Send to partner via data channel
      sendMessage(
        JSON.stringify({
          type: "translation",
          text: translated,
          original: trimmed,
          from: sourceLang,
          to: targetLang,
          isFinal: true,
          source: "text_input",
        }),
      );

      // Also send raw transcription for Cyrano
      sendMessage(
        JSON.stringify({
          type: "transcription",
          text: trimmed,
          lang: sourceLang,
          isFinal: true,
        }),
      );

      // Speak the translation via TTS
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(translated);
        utterance.lang = targetLang === "es" ? "es-CO" : targetLang;
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }

      setText("");
    } catch (err) {
      console.error("[TextInput] Translation failed:", err);
    } finally {
      setTranslating(false);
    }
  }, [text, translating, sourceLang, targetLang, sendMessage]);

  if (!FEATURE_TEXT_INPUT || !visible) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-[80px] md:bottom-[90px] inset-x-0 px-3 z-30 transition-all duration-200"
      style={{
        transform: visible ? "translateY(0)" : "translateY(100%)",
        opacity: visible ? 1 : 0,
      }}
    >
      <div
        className="flex flex-col gap-2 p-3 rounded-xl"
        style={{
          background: "rgba(6,6,10,0.95)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.5)",
        }}
      >
        {/* Last translation preview */}
        {lastTranslation && (
          <div className="text-xs text-[#00C896]/70 px-1 truncate">
            Last: {lastTranslation}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 200))}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder={`Type in ${sourceLang === "en" ? "English" : sourceLang}...`}
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder:text-white/30 outline-none focus:border-[#00C896]/50 transition-colors"
            disabled={translating}
            autoComplete="off"
            autoCorrect="off"
          />

          <button
            onClick={handleSend}
            disabled={!text.trim() || translating}
            className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
            style={{
              background: text.trim() ? "rgba(0,200,150,0.2)" : "rgba(255,255,255,0.05)",
              border: text.trim() ? "1px solid rgba(0,200,150,0.4)" : "1px solid rgba(255,255,255,0.1)",
            }}
          >
            {translating ? (
              <div className="w-4 h-4 border-2 border-[#00C896]/50 border-t-[#00C896] rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 text-[#00C896]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>

        {/* Character count */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-white/20">
            {text.length}/200
          </span>
          <span className="text-[10px] text-white/20">
            Press Enter to send, Esc to close
          </span>
        </div>
      </div>
    </div>
  );
}
