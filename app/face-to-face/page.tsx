"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getFlag, getSpeechCode, LANGUAGES } from "../lib/languages";
import { LanguageSelector } from "../components/LanguageSelector";
import type {
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent,
  SpeechRecognitionInstance,
} from "../lib/speech-types";
// Import to ensure global Window augmentation
import "../lib/speech-types";

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK FACE-TO-FACE - True Split-Screen Mode
// One device, two people, bidirectional real-time translation
// Blueprint compliant: NO networking, NO WebRTC, dual SpeechRecognition
// ═══════════════════════════════════════════════════════════════════════════════

type Speaker = "top" | "bottom";

interface TranslationState {
  original: string;
  translated: string;
  isListening: boolean;
  isTranslating: boolean;
}

export default function FaceToFacePage() {
  const router = useRouter();

  // Setup mode - show language selection first
  const [isSetupMode, setIsSetupMode] = useState(true);

  // Language configuration
  const [topLang, setTopLang] = useState("en");
  const [bottomLang, setBottomLang] = useState("es");

  // Speech states for each speaker
  const [topState, setTopState] = useState<TranslationState>({
    original: "",
    translated: "",
    isListening: false,
    isTranslating: false,
  });

  const [bottomState, setBottomState] = useState<TranslationState>({
    original: "",
    translated: "",
    isListening: false,
    isTranslating: false,
  });

  // Browser support
  const [browserSupported, setBrowserSupported] = useState(true);
  const [error, setError] = useState("");

  // Refs for speech recognition instances
  const topRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const bottomRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const topListeningRef = useRef(false);
  const bottomListeningRef = useRef(false);

  // Check browser support
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setBrowserSupported(false);
    }
  }, []);

  // Translation function
  const translate = useCallback(
    async (
      text: string,
      sourceLang: string,
      targetLang: string,
    ): Promise<string> => {
      if (!text.trim()) return "";

      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            sourceLang,
            targetLang,
          }),
        });

        if (!res.ok) {
          console.error("Translation failed:", res.status);
          return text;
        }

        const data = await res.json();
        return data.translation || text;
      } catch (err) {
        console.error("Translation error:", err);
        return text;
      }
    },
    [],
  );

  // Text-to-Speech function
  const speak = useCallback((text: string, lang: string) => {
    if (!text.trim() || typeof window === "undefined") return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getSpeechCode(lang);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  // Create speech recognition for a speaker
  const createRecognition = useCallback(
    (speaker: Speaker, lang: string): SpeechRecognitionInstance | null => {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return null;

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = getSpeechCode(lang);

      const setState = speaker === "top" ? setTopState : setBottomState;
      const targetLang = speaker === "top" ? bottomLang : topLang;
      const listeningRef =
        speaker === "top" ? topListeningRef : bottomListeningRef;

      recognition.onstart = () => {
        setState((prev) => ({ ...prev, isListening: true }));
      };

      recognition.onresult = async (event: SpeechRecognitionEvent) => {
        const results = event.results;
        let finalTranscript = "";
        let interimTranscript = "";

        for (let i = event.resultIndex; i < results.length; i++) {
          const transcript = results[i][0].transcript;
          if (results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const displayText = finalTranscript || interimTranscript;
        setState((prev) => ({ ...prev, original: displayText }));

        // Translate final results
        if (finalTranscript) {
          setState((prev) => ({ ...prev, isTranslating: true }));
          const translated = await translate(finalTranscript, lang, targetLang);

          // Update the OPPOSITE side with the translation
          const setOtherState =
            speaker === "top" ? setBottomState : setTopState;
          setOtherState((prev) => ({ ...prev, translated }));

          setState((prev) => ({ ...prev, isTranslating: false }));

          // Speak the translation on the other side
          speak(translated, targetLang);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error(`${speaker} speech error:`, event.error);
        if (event.error !== "no-speech" && event.error !== "aborted") {
          setError(`Microphone error: ${event.error}`);
        }
        setState((prev) => ({ ...prev, isListening: false }));
        listeningRef.current = false;
      };

      recognition.onend = () => {
        // Auto-restart if still supposed to be listening
        if (listeningRef.current) {
          try {
            recognition.start();
          } catch (e) {
            console.error("Failed to restart recognition:", e);
            setState((prev) => ({ ...prev, isListening: false }));
            listeningRef.current = false;
          }
        } else {
          setState((prev) => ({ ...prev, isListening: false }));
        }
      };

      return recognition;
    },
    [topLang, bottomLang, translate, speak],
  );

  // Toggle listening for a speaker
  const toggleListening = useCallback(
    (speaker: Speaker) => {
      const recognitionRef =
        speaker === "top" ? topRecognitionRef : bottomRecognitionRef;
      const listeningRef =
        speaker === "top" ? topListeningRef : bottomListeningRef;
      const otherListeningRef =
        speaker === "top" ? bottomListeningRef : topListeningRef;
      const lang = speaker === "top" ? topLang : bottomLang;
      const setState = speaker === "top" ? setTopState : setBottomState;

      // Stop the other speaker first (only one can speak at a time)
      if (otherListeningRef.current) {
        const otherRecognitionRef =
          speaker === "top" ? bottomRecognitionRef : topRecognitionRef;
        const otherSetState = speaker === "top" ? setBottomState : setTopState;
        otherListeningRef.current = false;
        try {
          otherRecognitionRef.current?.stop();
        } catch (e) {
          console.error("Error stopping other recognition:", e);
        }
        otherSetState((prev) => ({ ...prev, isListening: false }));
      }

      if (listeningRef.current) {
        // Stop listening
        listeningRef.current = false;
        try {
          recognitionRef.current?.stop();
        } catch (e) {
          console.error("Error stopping recognition:", e);
        }
        setState((prev) => ({ ...prev, isListening: false }));
      } else {
        // Start listening
        setError("");

        // Create new recognition instance
        const recognition = createRecognition(speaker, lang);
        if (!recognition) {
          setError("Speech recognition not supported");
          return;
        }

        recognitionRef.current = recognition;
        listeningRef.current = true;

        try {
          recognition.start();
        } catch (e) {
          console.error("Error starting recognition:", e);
          listeningRef.current = false;
          setError("Failed to start microphone");
        }
      }
    },
    [topLang, bottomLang, createRecognition],
  );

  // Clear all text
  const clearAll = useCallback(() => {
    setTopState({
      original: "",
      translated: "",
      isListening: false,
      isTranslating: false,
    });
    setBottomState({
      original: "",
      translated: "",
      isListening: false,
      isTranslating: false,
    });
    window.speechSynthesis.cancel();
  }, []);

  // Swap languages
  const swapLanguages = useCallback(() => {
    const temp = topLang;
    setTopLang(bottomLang);
    setBottomLang(temp);
    clearAll();
  }, [topLang, bottomLang, clearAll]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      topListeningRef.current = false;
      bottomListeningRef.current = false;
      try {
        topRecognitionRef.current?.stop();
        bottomRecognitionRef.current?.stop();
      } catch (e) {
        // Ignore
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  // Start session - exit setup mode
  const startSession = () => {
    if (topLang === bottomLang) {
      setError("Please select different languages for each speaker");
      return;
    }
    setIsSetupMode(false);
  };

  // Browser not supported
  if (!browserSupported) {
    return (
      <div className="min-h-screen bg-[#060810] flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Browser Not Supported
          </h2>
          <p className="text-gray-400 mb-6">
            Face-to-Face translation requires Chrome or Edge browser for speech
            recognition.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-[#00C896] text-white rounded-xl font-medium min-h-[44px]"
            aria-label="Go Back"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Setup mode - language selection
  if (isSetupMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#060810] via-[#0d1117] to-[#060810] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-6">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00C896] to-[#0066FF] mb-3 shadow-lg">
                <span className="text-3xl">🗣️</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-1">
                Face-to-Face Translation
              </h2>
              <p className="text-white/70 text-sm">
                Place phone between two people
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            {/* Language Selection */}
            <div className="space-y-4">
              {/* Your Language (Top Speaker) */}
              <div>
                <label className="block text-sm text-white/70 mb-2 flex items-center gap-2">
                  <span className="text-lg">👆</span>
                  <span>Top Speaker (You)</span>
                </label>
                <LanguageSelector
                  value={topLang}
                  onChange={setTopLang}
                  excludeCode={bottomLang}
                />
              </div>

              {/* Swap Button */}
              <div className="flex justify-center">
                <button
                  onClick={swapLanguages}
                  className="p-3 rounded-xl bg-[#1a1a2e] border border-gray-700 text-[#00C896] hover:bg-[#00C896]/10 hover:border-[#00C896]/50 transition min-h-[44px]"
                  aria-label="Swap languages"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                </button>
              </div>

              {/* Partner's Language (Bottom Speaker) */}
              <div>
                <label className="block text-sm text-white/70 mb-2 flex items-center gap-2">
                  <span className="text-lg">👇</span>
                  <span>Bottom Speaker (Partner)</span>
                </label>
                <LanguageSelector
                  value={bottomLang}
                  onChange={setBottomLang}
                  excludeCode={topLang}
                />
              </div>
            </div>

            {/* Preview */}
            <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-[#00C896]/10 to-[#0066FF]/10 border border-white/10">
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <span className="text-3xl">{getFlag(topLang)}</span>
                  <p className="text-xs text-white/70 mt-1">Top</p>
                </div>
                <span className="text-2xl text-white/70">↔</span>
                <div className="text-center">
                  <span className="text-3xl">{getFlag(bottomLang)}</span>
                  <p className="text-xs text-white/70 mt-1">Bottom</p>
                </div>
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={startSession}
              className="w-full mt-6 py-4 bg-gradient-to-r from-[#00C896] to-[#0066FF] hover:from-[#00B085] hover:to-[#0055DD] rounded-xl text-white font-semibold text-lg transition shadow-lg min-h-[44px]"
              aria-label="Start Translation"
            >
              🚀 Start Translation
            </button>

            {/* Back Link */}
            <button
              onClick={() => router.push("/")}
              className="w-full mt-3 py-3 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white/70 hover:text-white hover:border-gray-600 transition min-h-[44px]"
              aria-label="Back to Home"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen-safe min-h-screen-safe bg-[#060810] flex flex-col overflow-hidden select-none safe-x">
      {/* Error Banner */}
      {error && (
        <div className="absolute top-0 left-0 right-0 bg-red-500/90 text-white text-center py-2 px-4 z-50">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-4 text-white/80 hover:text-white min-h-[44px]"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* TOP HALF - Speaker 1 (e.g., English) */}
      <div className="flex-1 flex flex-col relative bg-gradient-to-b from-[#00C896]/10 to-transparent">
        {/* Top speaker controls */}
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <button
            onClick={() => setIsSetupMode(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition min-h-[44px]"
            aria-label="Change top speaker language"
          >
            <span className="text-2xl">{getFlag(topLang)}</span>
            <span className="text-white font-medium uppercase">{topLang}</span>
            <span className="text-white/70 text-xs">✏️</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={swapLanguages}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition min-h-[44px]"
              aria-label="Swap languages"
            >
              ⇄ Swap
            </button>
            <button
              onClick={() => router.push("/")}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition min-h-[44px]"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Top content area - responsive padding */}
        <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 gap-3 sm:gap-4">
          {/* What I said (my original text) */}
          {topState.original && (
            <div className="w-full max-w-lg px-1 sm:px-0">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-1 uppercase">
                You said:
              </p>
              <p className="text-white text-base sm:text-lg">
                {topState.original}
              </p>
            </div>
          )}

          {/* Translation from bottom speaker (what they said, translated for me) */}
          {topState.translated && (
            <div
              className="w-full max-w-lg bg-[#00C896]/20 rounded-xl p-3 sm:p-4"
              role="region"
              aria-live="polite"
              aria-label="Translation"
            >
              <p className="text-[10px] sm:text-xs text-[#00C896] mb-1 uppercase">
                They said (translated):
              </p>
              <p className="text-white text-lg sm:text-xl font-medium">
                {topState.translated}
              </p>
            </div>
          )}

          {/* Big mic button - responsive size */}
          <button
            onClick={() => toggleListening("top")}
            className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-3xl sm:text-4xl transition-all shadow-lg ${
              topState.isListening
                ? "bg-red-500 animate-pulse scale-110"
                : "bg-[#00C896] hover:bg-[#00B085] hover:scale-105"
            }`}
            aria-label={
              topState.isListening ? "Stop speaking" : "Start speaking"
            }
          >
            {topState.isListening ? "⏹" : "🎤"}
          </button>

          {topState.isListening && (
            <p className="text-[#00C896] text-sm animate-pulse">
              Listening... Tap to stop
            </p>
          )}

          {topState.isTranslating && (
            <p className="text-yellow-400 text-sm">Translating...</p>
          )}
        </div>
      </div>

      {/* DIVIDER - Visual separator between speakers */}
      <div className="h-1 bg-gradient-to-r from-[#00C896] via-[#0066FF] to-[#00C896] relative">
        <div className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#060810] px-4 py-1 rounded-full border border-white/20">
          <span className="text-white text-sm">
            {getFlag(topLang)} ↔ {getFlag(bottomLang)}
          </span>
        </div>
      </div>

      {/* BOTTOM HALF - Speaker 2 (e.g., Spanish) - ROTATED 180° */}
      <div className="flex-1 flex flex-col relative bg-gradient-to-t from-[#0066FF]/10 to-transparent rotate-180">
        {/* Bottom speaker controls (appears at top of their view) */}
        <div className="flex items-center justify-between p-3 border-b border-white/10">
          <button
            onClick={() => setIsSetupMode(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition min-h-[44px]"
            aria-label="Change bottom speaker language"
          >
            <span className="text-2xl">{getFlag(bottomLang)}</span>
            <span className="text-white font-medium uppercase">
              {bottomLang}
            </span>
            <span className="text-white/70 text-xs">✏️</span>
          </button>
          <button
            onClick={clearAll}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition min-h-[44px]"
            aria-label="Clear all translations"
          >
            Clear
          </button>
        </div>

        {/* Bottom content area - responsive padding */}
        <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 gap-3 sm:gap-4">
          {/* What I said (my original text) */}
          {bottomState.original && (
            <div className="w-full max-w-lg px-1 sm:px-0">
              <p className="text-[10px] sm:text-xs text-gray-500 mb-1 uppercase">
                You said:
              </p>
              <p className="text-white text-base sm:text-lg">
                {bottomState.original}
              </p>
            </div>
          )}

          {/* Translation from top speaker (what they said, translated for me) */}
          {bottomState.translated && (
            <div
              className="w-full max-w-lg bg-[#0066FF]/20 rounded-xl p-3 sm:p-4"
              role="region"
              aria-live="polite"
              aria-label="Translation"
            >
              <p className="text-[10px] sm:text-xs text-[#0066FF] mb-1 uppercase">
                They said (translated):
              </p>
              <p className="text-white text-lg sm:text-xl font-medium">
                {bottomState.translated}
              </p>
            </div>
          )}

          {/* Big mic button - responsive size */}
          <button
            onClick={() => toggleListening("bottom")}
            className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-3xl sm:text-4xl transition-all shadow-lg ${
              bottomState.isListening
                ? "bg-red-500 animate-pulse scale-110"
                : "bg-[#0066FF] hover:bg-[#0055DD] hover:scale-105"
            }`}
            aria-label={
              bottomState.isListening ? "Stop speaking" : "Start speaking"
            }
          >
            {bottomState.isListening ? "⏹" : "🎤"}
          </button>

          {bottomState.isListening && (
            <p className="text-[#0066FF] text-sm animate-pulse">
              Listening... Tap to stop
            </p>
          )}

          {bottomState.isTranslating && (
            <p className="text-yellow-400 text-sm">Translating...</p>
          )}
        </div>
      </div>
    </div>
  );
}
