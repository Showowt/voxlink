"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LANGUAGES,
  getLanguage,
  getSpeechCode,
  getFlag,
} from "./lib/languages";
import {
  DualLanguageSelector,
  LanguageGrid,
} from "./components/LanguageSelector";
// Premium UI Components
import { AnimatedBackground } from "./components/ui/AnimatedBackground";
import { GlassCard } from "./components/ui/GlassCard";
import { GlowButton } from "./components/ui/GlowButton";
import { EntrevozLogo } from "./components/ui/EntrevozLogo";
import { PillTabs, SimplePillTabs } from "./components/ui/PillTabs";

// ═══════════════════════════════════════════════════════════════════════════════
// VOXTYPE COMPONENT - Type & Verify Translation (Back-Translation)
// Solves: Google Translate meaning drift, copy-paste friction
// ═══════════════════════════════════════════════════════════════════════════════

function VoxTypeTab() {
  // Language state - now supports all languages
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("es");

  // Text state
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [backTranslation, setBackTranslation] = useState("");

  // UI state
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [meaningMatch, setMeaningMatch] = useState<"match" | "warning" | null>(
    null,
  );
  const [canShare, setCanShare] = useState(false);

  // Check if Web Share API is available
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  // Debounce timer
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-sync languages - prevent same source/target
  useEffect(() => {
    if (sourceLang === targetLang) {
      // Find a different target language
      const otherLangs = LANGUAGES.filter((l) => l.code !== sourceLang);
      setTargetLang(otherLangs[0]?.code || "es");
    }
  }, [sourceLang, targetLang]);

  // Swap languages
  const swapLanguages = useCallback(() => {
    const newSource = targetLang;
    const newTarget = sourceLang;
    setSourceLang(newSource);
    setTargetLang(newTarget);
    setInputText("");
    setTranslatedText("");
    setBackTranslation("");
    setMeaningMatch(null);
  }, [sourceLang, targetLang]);

  // Translate with back-translation
  const translateWithVerification = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setTranslatedText("");
        setBackTranslation("");
        setMeaningMatch(null);
        return;
      }

      setIsTranslating(true);
      setError("");

      try {
        // Step 1: Translate to target language
        const response1 = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            sourceLang,
            targetLang,
          }),
        });

        if (!response1.ok) throw new Error("Translation failed");
        const data1 = await response1.json();

        if (!data1.translation) {
          setError(data1.error || "Translation failed");
          return;
        }

        setTranslatedText(data1.translation);

        // Step 2: Back-translate to verify meaning
        const response2 = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: data1.translation,
            sourceLang: targetLang,
            targetLang: sourceLang,
          }),
        });

        if (!response2.ok) throw new Error("Back-translation failed");
        const data2 = await response2.json();

        if (data2.translation) {
          setBackTranslation(data2.translation);

          // Simple meaning comparison (normalize and compare)
          const normalize = (s: string) =>
            s
              .toLowerCase()
              .replace(/[^\w\s]/g, "")
              .trim();
          const original = normalize(text);
          const back = normalize(data2.translation);

          // Check similarity
          const words1 = original.split(/\s+/);
          const words2 = back.split(/\s+/);
          const commonWords = words1.filter((w) => words2.includes(w));
          const similarity =
            commonWords.length / Math.max(words1.length, words2.length);

          setMeaningMatch(similarity > 0.5 ? "match" : "warning");
        }
      } catch (err) {
        console.error("Translation error:", err);
        setError("Translation failed. Check your connection.");
      } finally {
        setIsTranslating(false);
      }
    },
    [sourceLang, targetLang],
  );

  // Debounced translation on input change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (inputText.trim()) {
      debounceRef.current = setTimeout(() => {
        translateWithVerification(inputText);
      }, 500);
    } else {
      setTranslatedText("");
      setBackTranslation("");
      setMeaningMatch(null);
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputText, translateWithVerification]);

  // Copy translation
  const copyTranslation = async () => {
    if (!translatedText) return;

    try {
      await navigator.clipboard.writeText(translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = translatedText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Share translation (Web Share API)
  const shareTranslation = async () => {
    if (!translatedText) return;

    try {
      await navigator.share({
        text: translatedText,
      });
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (err: any) {
      // User cancelled or share failed - fallback to copy
      if (err.name !== "AbortError") {
        copyTranslation();
      }
    }
  };

  // Clear all
  const clearAll = () => {
    setInputText("");
    setTranslatedText("");
    setBackTranslation("");
    setError("");
    setMeaningMatch(null);
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header - Hidden on small mobile to save space */}
      <div className="text-center pb-1 sm:pb-2 hidden sm:block">
        <p className="text-white/70 text-xs sm:text-sm">
          Type → Translate →{" "}
          <span className="text-voxxo-400 font-medium">Verify meaning</span> →
          Share
        </p>
      </div>

      {/* Language Selector - Multi-language support */}
      <DualLanguageSelector
        sourceLang={sourceLang}
        targetLang={targetLang}
        onSourceChange={setSourceLang}
        onTargetChange={setTargetLang}
        onSwap={swapLanguages}
        compact={true}
      />

      {/* Input Field - Premium Glass Style */}
      <div className="space-y-1.5 sm:space-y-2">
        <label className="text-xs sm:text-sm text-white/60 flex items-center gap-1.5 sm:gap-2">
          <span>{getFlag(sourceLang)}</span>
          Type your message
        </label>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            sourceLang === "en"
              ? "Type what you want to say..."
              : "Escribe lo que quieres decir..."
          }
          rows={2}
          inputMode="text"
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="sentences"
          spellCheck={true}
          enterKeyHint="send"
          aria-label="Type your message to translate"
          className="glass-input w-full px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl text-white placeholder-white/30 text-base sm:text-lg"
        />
      </div>

      {/* Error */}
      {error && (
        <GlassCard variant="subtle" padding="sm" glow="error">
          <p className="text-red-400 text-xs sm:text-sm text-center">{error}</p>
        </GlassCard>
      )}

      {/* Loading */}
      {isTranslating && (
        <div className="flex items-center justify-center gap-2 py-3 sm:py-4">
          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-voxxo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-white/70 text-xs sm:text-sm">
            Translating...
          </span>
        </div>
      )}

      {/* Translation Result */}
      {translatedText && !isTranslating && (
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs sm:text-sm text-white/60 flex items-center gap-1.5 sm:gap-2">
              <span>{getFlag(targetLang)}</span>
              Translation
            </label>
          </div>
          <GlassCard variant="default" padding="sm" glow="voxxo">
            <p className="text-voxxo-100 text-sm sm:text-base">
              {translatedText}
            </p>
          </GlassCard>

          {/* Share/Copy Buttons - Premium Style */}
          <div className="flex gap-2">
            {canShare ? (
              <>
                <GlowButton
                  onClick={shareTranslation}
                  variant={shared ? "success" : "success"}
                  size="lg"
                  fullWidth
                  icon={<span>{shared ? "✓" : "📤"}</span>}
                  aria-label={
                    shared ? "Translation shared" : "Share translation"
                  }
                >
                  {shared ? "Shared!" : "Share"}
                </GlowButton>
                <GlowButton
                  onClick={copyTranslation}
                  variant={copied ? "success" : "secondary"}
                  size="lg"
                  aria-label={
                    copied
                      ? "Translation copied to clipboard"
                      : "Copy translation to clipboard"
                  }
                >
                  {copied ? "✓" : "📋"}
                </GlowButton>
              </>
            ) : (
              <GlowButton
                onClick={copyTranslation}
                variant={copied ? "success" : "primary"}
                size="lg"
                fullWidth
                icon={<span>{copied ? "✓" : "📋"}</span>}
                aria-label={
                  copied
                    ? "Translation copied to clipboard"
                    : "Copy translation to clipboard"
                }
              >
                {copied ? "Copied!" : "Copy Translation"}
              </GlowButton>
            )}
          </div>
        </div>
      )}

      {/* Back-Translation Verification - Compact */}
      {backTranslation && !isTranslating && (
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs sm:text-sm text-white/60 flex items-center gap-1.5">
              <span>🔄</span>
              <span className="hidden sm:inline">Verification</span>
              <span className="sm:hidden">Verify</span>
            </label>
            {meaningMatch === "match" && (
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                ✓ OK
              </span>
            )}
            {meaningMatch === "warning" && (
              <span className="text-xs text-amber-400 flex items-center gap-1 font-medium">
                ⚠️ Check
              </span>
            )}
          </div>
          <GlassCard
            variant="subtle"
            padding="sm"
            glow={
              meaningMatch === "match"
                ? "voxxo"
                : meaningMatch === "warning"
                  ? "gold"
                  : "none"
            }
          >
            <p className="text-[10px] sm:text-xs text-white/70 mb-0.5 sm:mb-1">
              They will understand:
            </p>
            <p
              className={`text-sm sm:text-base ${
                meaningMatch === "match"
                  ? "text-emerald-200"
                  : meaningMatch === "warning"
                    ? "text-amber-200"
                    : "text-white/70"
              }`}
            >
              {backTranslation}
            </p>
          </GlassCard>

          {meaningMatch === "warning" && (
            <p className="text-[10px] sm:text-xs text-amber-400 text-center">
              💡 Rephrase with simpler words
            </p>
          )}
        </div>
      )}

      {/* Clear Button - Ghost Style */}
      {inputText && (
        <GlowButton
          onClick={clearAll}
          variant="ghost"
          size="md"
          fullWidth
          icon={<span>🗑️</span>}
          aria-label="Clear all text and translations"
        >
          Clear
        </GlowButton>
      )}

      {/* WhatsApp Workflow - Premium Info Card */}
      {!translatedText && (
        <GlassCard
          variant="subtle"
          padding="sm"
          className="border-voxxo-500/20"
        >
          <p className="text-voxxo-400 text-xs sm:text-sm font-medium flex items-center gap-2">
            <span className="text-base sm:text-lg">💬</span> How it works
          </p>
          <ol className="text-white/70 text-[10px] sm:text-xs mt-1.5 sm:mt-2 space-y-0.5 sm:space-y-1 list-decimal list-inside">
            <li>Type your message</li>
            <li>Check verification matches your intent</li>
            <li>Tap Share or Copy</li>
          </ol>
        </GlassCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VOXNOTE COMPONENT - WhatsApp Voice Message Translator
// Fixed: Stale closure bug, cleanup on unmount, same language prevention
// ═══════════════════════════════════════════════════════════════════════════════

function VoxNoteTab() {
  // Language state - default: Spanish -> English (most common for WhatsApp voice msgs)
  const [sourceLang, setSourceLang] = useState("es");
  const [targetLang, setTargetLang] = useState("en");

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  // Text state
  const [originalText, setOriginalText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [interimText, setInterimText] = useState("");

  // UI state
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"original" | "translated" | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [shared, setShared] = useState(false);
  const [canShare, setCanShare] = useState(false);

  // Check if Web Share API is available
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  // Refs to avoid stale closures
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);
  const finalTranscriptRef = useRef("");

  // Keep ref in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Check online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop recording state first to prevent restart
      isRecordingRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      speechSynthesis.cancel();
    };
  }, []);

  // Auto-sync languages to prevent same source/target
  useEffect(() => {
    if (sourceLang === targetLang) {
      const otherLangs = LANGUAGES.filter((l) => l.code !== sourceLang);
      setTargetLang(otherLangs[0]?.code || "en");
    }
  }, [sourceLang, targetLang]);

  // Swap languages
  const swapLanguages = useCallback(() => {
    const newSource = targetLang;
    const newTarget = sourceLang;
    setSourceLang(newSource);
    setTargetLang(newTarget);

    // Also swap the text if both exist
    if (originalText && translatedText) {
      setOriginalText(translatedText);
      setTranslatedText(originalText);
    }
  }, [sourceLang, targetLang, originalText, translatedText]);

  // Translate text via API
  const translateText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setIsProcessing(true);
      setError("");

      try {
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            sourceLang,
            targetLang,
          }),
        });

        if (!response.ok) {
          throw new Error("Translation failed");
        }

        const data = await response.json();
        if (data.translation) {
          setTranslatedText(data.translation);
        } else if (data.error) {
          setError(data.error);
        } else {
          setError("Translation failed. Please try again.");
        }
      } catch (err) {
        console.error("Translation error:", err);
        setError("Translation failed. Check your connection.");
      } finally {
        setIsProcessing(false);
      }
    },
    [sourceLang, targetLang],
  );

  // Start recording
  const startRecording = useCallback(() => {
    // Reset state
    setError("");
    setOriginalText("");
    setTranslatedText("");
    setInterimText("");
    setRecordingTime(0);
    finalTranscriptRef.current = "";

    // Check browser support
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported. Please use Chrome or Edge.");
      return;
    }

    // Check online
    if (!navigator.onLine) {
      setError("No internet connection. Speech recognition requires internet.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getSpeechCode(sourceLang);
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + " ";
        } else {
          interim = transcript;
        }
      }

      if (final) {
        finalTranscriptRef.current += final;
        setOriginalText(finalTranscriptRef.current);
      }
      setInterimText(interim);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);

      switch (event.error) {
        case "no-speech":
          setError("No speech detected. Please try again.");
          break;
        case "audio-capture":
          setError("No microphone found. Please check your device.");
          break;
        case "not-allowed":
          setError("Microphone access denied. Please allow microphone access.");
          break;
        case "network":
          setError("Network error. Please check your connection.");
          break;
        default:
          setError(`Error: ${event.error}`);
      }

      stopRecording();
    };

    recognition.onend = () => {
      // Use ref to check current state (fixes stale closure)
      if (isRecordingRef.current) {
        // Recognition ended but we're still recording - restart it
        try {
          recognition.start();
        } catch {}
      } else {
        // We intentionally stopped - translate what we have
        const textToTranslate = finalTranscriptRef.current.trim();
        if (textToTranslate) {
          translateText(textToTranslate);
        }
      }
    };

    // Start recognition
    try {
      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (err) {
      setError("Could not start recording. Please try again.");
    }
  }, [sourceLang, translateText]);

  // Stop recording
  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setInterimText("");

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  // Toggle recording
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (
    text: string,
    type: "original" | "translated",
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  // Share translation (Web Share API)
  const shareTranslation = async () => {
    if (!translatedText) return;
    try {
      await navigator.share({ text: translatedText });
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        copyToClipboard(translatedText, "translated");
      }
    }
  };

  // Speak translation
  const speakTranslation = () => {
    if (!translatedText || isSpeaking) return;

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(translatedText);
    utterance.lang = getSpeechCode(targetLang);
    utterance.rate = 0.9;
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    speechSynthesis.speak(utterance);
  };

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Clear all
  const clearAll = () => {
    setOriginalText("");
    setTranslatedText("");
    setInterimText("");
    setError("");
    setRecordingTime(0);
    finalTranscriptRef.current = "";
    speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Display text (original + interim while recording)
  const displayText =
    originalText + (interimText ? (originalText ? " " : "") + interimText : "");

  // Check for browser support
  const [browserSupported, setBrowserSupported] = useState(true);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    setBrowserSupported(!!SpeechRecognition);
  }, []);

  return (
    <div className="space-y-2 sm:space-y-3">
      {/* Browser Compatibility Warning */}
      {!browserSupported && (
        <GlassCard variant="subtle" padding="sm" glow="gold">
          <p className="text-amber-400 text-xs sm:text-sm text-center">
            ⚠️ Use Chrome or Edge browser
          </p>
        </GlassCard>
      )}

      {/* Offline Warning */}
      {!isOnline && (
        <GlassCard variant="subtle" padding="sm" glow="gold">
          <p className="text-amber-400 text-xs sm:text-sm text-center">
            ⚠️ You&apos;re offline
          </p>
        </GlassCard>
      )}

      {/* Language Selector - Multi-language support */}
      <DualLanguageSelector
        sourceLang={sourceLang}
        targetLang={targetLang}
        onSourceChange={setSourceLang}
        onTargetChange={setTargetLang}
        onSwap={swapLanguages}
        disabled={isRecording}
        compact={true}
      />

      {/* Recording Button - Premium Design */}
      <div className="flex flex-col items-center py-3 sm:py-4">
        <button
          onClick={toggleRecording}
          disabled={isProcessing || !isOnline || !browserSupported}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
            isProcessing || !browserSupported
              ? "bg-white/10 cursor-not-allowed"
              : isRecording
                ? "bg-gradient-to-br from-red-500 to-red-600 shadow-2xl shadow-red-500/40"
                : "bg-gradient-to-br from-voxxo-400 to-voxxo-600 shadow-2xl shadow-voxxo-500/40 hover:shadow-voxxo-500/60 hover:scale-105"
          }`}
          style={
            isRecording ? { animation: "pulse 1.5s ease-in-out infinite" } : {}
          }
        >
          {/* Outer ring glow */}
          {!isProcessing && !isRecording && (
            <span
              className="absolute inset-0 rounded-full ring-2 ring-voxxo-400/30 animate-ping"
              style={{ animationDuration: "2s" }}
            />
          )}

          {isProcessing ? (
            <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
          ) : isRecording ? (
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-lg shadow-lg" />
          ) : (
            <svg
              className="w-10 h-10 sm:w-12 sm:h-12 text-void-DEFAULT"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z" />
            </svg>
          )}
        </button>

        {/* Recording indicator */}
        {isRecording && (
          <div className="mt-2 sm:mt-3 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-red-500"></span>
            </span>
            <span className="text-red-400 font-mono text-base sm:text-lg font-medium">
              {formatTime(recordingTime)}
            </span>
          </div>
        )}

        <p className="text-white/70 text-xs sm:text-sm mt-2">
          {!browserSupported
            ? "Use Chrome or Edge"
            : isProcessing
              ? "Translating..."
              : isRecording
                ? "Tap to stop"
                : "Tap to record"}
        </p>
      </div>

      {/* Error */}
      {error && (
        <GlassCard variant="subtle" padding="sm" glow="error">
          <p className="text-red-400 text-xs sm:text-sm text-center">{error}</p>
        </GlassCard>
      )}

      {/* Original Text - Premium Glass Style */}
      {displayText && (
        <div className="space-y-1 sm:space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-white/60 flex items-center gap-1.5">
              <span>{getFlag(sourceLang)}</span>
              Original
              {isRecording && (
                <span className="text-voxxo-400 text-[10px] sm:text-xs font-medium">
                  (listening)
                </span>
              )}
            </span>
          </div>
          <GlassCard
            variant={isRecording ? "interactive" : "subtle"}
            padding="sm"
            glow={isRecording ? "voxxo" : "none"}
          >
            <p className="text-white text-sm sm:text-base">
              {displayText}
              {isRecording && (
                <span className="animate-pulse text-voxxo-400">|</span>
              )}
            </p>
          </GlassCard>
        </div>
      )}

      {/* Translated Text - Premium Glass Style */}
      {translatedText && (
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-white/60 flex items-center gap-1.5">
              <span>{getFlag(targetLang)}</span>
              Translation
            </span>
            <button
              onClick={speakTranslation}
              disabled={isSpeaking}
              aria-label={isSpeaking ? "Speaking..." : "Play translation"}
              className={`text-xs transition-all duration-200 p-2 min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center ${
                isSpeaking
                  ? "text-voxxo-400 bg-voxxo-500/10"
                  : "text-voxxo-500 hover:text-voxxo-400 hover:bg-voxxo-500/10"
              }`}
            >
              {isSpeaking ? "🔊..." : "🔊"}
            </button>
          </div>
          <GlassCard variant="default" padding="sm" glow="voxxo">
            <p className="text-voxxo-100 text-sm sm:text-base">
              {translatedText}
            </p>
          </GlassCard>

          {/* Share/Copy Buttons - Premium Style */}
          <div className="flex gap-2">
            {canShare ? (
              <>
                <GlowButton
                  onClick={shareTranslation}
                  variant="success"
                  size="lg"
                  fullWidth
                  icon={<span>{shared ? "✓" : "📤"}</span>}
                  aria-label={
                    shared ? "Translation shared" : "Share translation"
                  }
                >
                  {shared ? "Shared!" : "Share"}
                </GlowButton>
                <GlowButton
                  onClick={() => copyToClipboard(translatedText, "translated")}
                  variant={copied === "translated" ? "success" : "secondary"}
                  size="lg"
                  aria-label={
                    copied === "translated"
                      ? "Translation copied to clipboard"
                      : "Copy translation to clipboard"
                  }
                >
                  {copied === "translated" ? "✓" : "📋"}
                </GlowButton>
              </>
            ) : (
              <GlowButton
                onClick={() => copyToClipboard(translatedText, "translated")}
                variant={copied === "translated" ? "success" : "primary"}
                size="lg"
                fullWidth
                icon={<span>{copied === "translated" ? "✓" : "📋"}</span>}
                aria-label={
                  copied === "translated"
                    ? "Translation copied to clipboard"
                    : "Copy translation to clipboard"
                }
              >
                {copied === "translated" ? "Copied!" : "Copy"}
              </GlowButton>
            )}
          </div>
        </div>
      )}

      {/* Clear Button - Ghost Style */}
      {(originalText || translatedText) && !isRecording && (
        <GlowButton
          onClick={clearAll}
          variant="ghost"
          size="md"
          fullWidth
          icon={<span>🗑️</span>}
          aria-label="Clear all text and translations"
        >
          Clear
        </GlowButton>
      )}

      {/* WhatsApp Tip - Premium Info Card */}
      {!displayText && !translatedText && (
        <GlassCard
          variant="subtle"
          padding="sm"
          className="border-voxxo-500/20"
        >
          <p className="text-voxxo-400 text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2">
            <span>💡</span> Tip
          </p>
          <p className="text-white/70 text-[10px] sm:text-xs mt-1 sm:mt-2">
            Play a WhatsApp voice message on speaker, then tap record to
            translate!
          </p>
        </GlassCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HOME CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Check for join links
  const joinType = searchParams.get("join");
  const joinId = searchParams.get("id");

  // Form state
  const [name, setName] = useState("");
  // Detect browser language for better default
  const [language, setLanguage] = useState(() => {
    if (typeof window === "undefined") return "en";
    const browserLang = navigator.language?.split("-")[0] || "en";
    // Check if browser language is supported
    const supported = LANGUAGES.find((l) => l.code === browserLang);
    return supported ? browserLang : "en";
  });
  const [joinCode, setJoinCode] = useState("");
  const [activeTab, setActiveTab] = useState<
    "video" | "talk" | "voxnote" | "voxtype" | "proximity" | "wingman"
  >("voxtype");
  const [mode, setMode] = useState<"start" | "join">("start");
  const [isJoining, setIsJoining] = useState(false);

  // Browser compatibility check
  const [browserWarning, setBrowserWarning] = useState<string | null>(null);

  useEffect(() => {
    // Check SpeechRecognition support
    const hasSpeech =
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

    if (!hasSpeech) {
      const userAgent = navigator.userAgent.toLowerCase();
      if (userAgent.includes("firefox")) {
        setBrowserWarning(
          "Firefox does not support voice features. Please use Chrome, Edge, or Safari.",
        );
      } else if (
        userAgent.includes("safari") &&
        !userAgent.includes("chrome")
      ) {
        // Safari has partial support, show softer warning
        setBrowserWarning(
          "Some voice features may not work in Safari. Chrome recommended.",
        );
      } else {
        setBrowserWarning(
          "Your browser may not support voice features. Chrome recommended.",
        );
      }
    }
  }, []);

  // Load saved preferences
  useEffect(() => {
    const savedName = localStorage.getItem("entrevoz_name");
    const savedLang = localStorage.getItem("entrevoz_lang");
    if (savedName) setName(savedName);
    if (savedLang && LANGUAGES.find((l) => l.code === savedLang))
      setLanguage(savedLang);

    // Handle join links
    if (joinType && joinId) {
      setIsJoining(true);
      setJoinCode(joinId.toUpperCase());
      setActiveTab(joinType === "talk" ? "talk" : "video");
      setMode("join");
    }
  }, [joinType, joinId]);

  // Save preferences
  useEffect(() => {
    if (name) localStorage.setItem("entrevoz_name", name);
    if (language) localStorage.setItem("entrevoz_lang", language);
  }, [name, language]);

  // Generate cryptographically secure room code
  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No O/0/I/1 for clarity
    const array = new Uint8Array(6);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => chars[byte % chars.length]).join("");
  };

  // Start Video Call
  const startVideoCall = () => {
    if (!name.trim()) {
      alert("Please enter your name");
      return;
    }
    const code = generateCode();
    router.push(
      `/call/${code}?host=true&name=${encodeURIComponent(name)}&lang=${language}`,
    );
  };

  // Join Video Call
  const joinVideoCall = () => {
    if (!name.trim()) {
      alert("Please enter your name");
      return;
    }
    if (!joinCode.trim() || joinCode.length < 4) {
      alert("Please enter a valid code");
      return;
    }
    router.push(
      `/call/${joinCode.toUpperCase()}?host=false&name=${encodeURIComponent(name)}&lang=${language}`,
    );
  };

  // Start Talk Mode
  const startTalkMode = () => {
    if (!name.trim()) {
      alert("Please enter your name");
      return;
    }
    const code = generateCode();
    router.push(
      `/talk/${code}?host=true&name=${encodeURIComponent(name)}&lang=${language}`,
    );
  };

  // Join Talk Mode
  const joinTalkMode = () => {
    if (!name.trim()) {
      alert("Please enter your name");
      return;
    }
    if (!joinCode.trim() || joinCode.length < 4) {
      alert("Please enter a valid code");
      return;
    }
    router.push(
      `/talk/${joinCode.toUpperCase()}?host=false&name=${encodeURIComponent(name)}&lang=${language}`,
    );
  };

  // Joining screen - Premium Design
  if (isJoining && joinId) {
    return (
      <AnimatedBackground variant="mesh">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="w-full max-w-md">
            <GlassCard variant="elevated" padding="lg" animate>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-voxxo-400 to-accent-DEFAULT shadow-2xl shadow-voxxo-500/30 mb-3">
                  <span className="text-3xl">
                    {joinType === "talk" ? "💬" : "📹"}
                  </span>
                </div>
                <h2 className="text-xl font-bold text-white mt-3">
                  Join {joinType === "talk" ? "Conversation" : "Video Call"}
                </h2>
                <p className="text-white/70 text-sm mt-1">
                  Code:{" "}
                  <span className="font-mono text-voxxo-400 font-semibold">
                    {joinId}
                  </span>
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    inputMode="text"
                    autoComplete="name"
                    autoCorrect="off"
                    autoCapitalize="words"
                    spellCheck={false}
                    enterKeyHint="next"
                    aria-label="Your name"
                    className="glass-input w-full px-4 py-3 rounded-xl text-white placeholder-white/30 text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm text-white/60 mb-2">
                    You Speak
                  </label>
                  <LanguageGrid value={language} onChange={setLanguage} />
                </div>

                <GlowButton
                  onClick={joinType === "talk" ? joinTalkMode : joinVideoCall}
                  variant="primary"
                  size="xl"
                  fullWidth
                  icon={<span>{joinType === "talk" ? "💬" : "📹"}</span>}
                  aria-label={
                    joinType === "talk"
                      ? "Join conversation"
                      : "Join video call"
                  }
                >
                  Join
                </GlowButton>
              </div>
            </GlassCard>
          </div>
        </div>
      </AnimatedBackground>
    );
  }

  // Tab configuration for PillTabs
  const tabs = [
    { id: "voxtype", label: "Type", icon: <span>⌨️</span> },
    { id: "voxnote", label: "Voice", icon: <span>🎤</span>, color: "emerald" },
    { id: "wingman", label: "Ear", icon: <span>🎧</span>, color: "violet" },
    { id: "talk", label: "Face", icon: <span>💬</span> },
    { id: "video", label: "Call", icon: <span>📹</span> },
    { id: "proximity", label: "", icon: <span>📡</span>, color: "purple" },
  ];

  return (
    <AnimatedBackground
      variant="mesh"
      className="flex flex-col py-3 px-3 sm:py-4 sm:px-4 sm:justify-center overflow-y-auto"
    >
      <div className="w-full max-w-md mx-auto flex-shrink-0">
        {/* Logo - Premium Animated */}
        <div className="mb-4 sm:mb-6">
          <EntrevozLogo size="md" animate showBrand />
        </div>

        {/* Browser Compatibility Warning */}
        {browserWarning && (
          <GlassCard
            variant="subtle"
            padding="sm"
            glow="gold"
            className="mb-3 sm:mb-4"
          >
            <p className="text-amber-400 text-xs sm:text-sm flex items-center justify-center gap-2">
              <span>⚠️</span>
              {browserWarning}
            </p>
          </GlassCard>
        )}

        {/* Main Card - Premium Glass */}
        <GlassCard
          variant="elevated"
          padding="none"
          className="overflow-hidden"
        >
          {/* Mode Tabs - Premium PillTabs */}
          <div className="p-2 sm:p-3 border-b border-white/[0.06]">
            <PillTabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={(id) => setActiveTab(id as typeof activeTab)}
              variant="compact"
            />
          </div>

          <div className="p-3 sm:p-5 max-h-[calc(100dvh-200px)] xs:max-h-[calc(100dvh-220px)] sm:max-h-none overflow-y-auto">
            {/* VoxType Tab - Type & Verify Translation */}
            {activeTab === "voxtype" ? (
              <VoxTypeTab />
            ) : activeTab === "voxnote" ? (
              <VoxNoteTab />
            ) : activeTab === "wingman" ? (
              <div className="space-y-4 text-center">
                {/* Premium Headphone Icon */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 shadow-2xl shadow-violet-500/30" />
                  <div
                    className="absolute inset-0 rounded-full animate-ping bg-violet-500/20"
                    style={{ animationDuration: "2s" }}
                  />
                  <div className="relative w-full h-full rounded-full flex items-center justify-center">
                    <span className="text-3xl sm:text-4xl">🎧</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">
                    Wingman Mode
                  </h3>
                  <p className="text-white/70 text-xs sm:text-sm mt-1">
                    AI whispers what to say in your AirPods
                  </p>
                </div>
                <GlassCard variant="subtle" padding="sm" className="text-left">
                  <ul className="text-xs sm:text-sm text-white/70 space-y-1.5 sm:space-y-2">
                    <li className="flex items-start gap-1.5 sm:gap-2">
                      <span className="text-violet-400">💘</span>
                      Date Mode — First dates, crushes, spark
                    </li>
                    <li className="flex items-start gap-1.5 sm:gap-2">
                      <span className="text-violet-400">🎯</span>
                      Interview Mode — Jobs, pitches, negotiations
                    </li>
                    <li className="flex items-start gap-1.5 sm:gap-2">
                      <span className="text-violet-400">⚡</span>
                      Sales Mode — Close deals, handle objections
                    </li>
                    <li className="flex items-start gap-1.5 sm:gap-2">
                      <span className="text-violet-400">🌊</span>
                      Hard Talk — Conflict, honesty, repair
                    </li>
                  </ul>
                </GlassCard>
                <button
                  onClick={() => router.push("/wingman")}
                  className="w-full py-3 sm:py-4 min-h-[48px] sm:min-h-[56px] bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 rounded-xl sm:rounded-2xl text-white font-semibold text-base sm:text-lg transition-all duration-200 shadow-2xl shadow-violet-500/25 hover:-translate-y-0.5"
                  aria-label="Activate Wingman mode - AI whispers what to say in your AirPods"
                >
                  🎧 Activate Wingman
                </button>
                <p className="text-xs text-white/70">
                  Connect AirPods for best experience
                </p>
              </div>
            ) : activeTab === "proximity" ? (
              <div className="space-y-4 text-center">
                {/* Premium Radar Icon */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 mx-auto">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shadow-2xl shadow-purple-500/30" />
                  <div
                    className="absolute inset-0 rounded-full animate-ping bg-purple-500/20"
                    style={{ animationDuration: "2s" }}
                  />
                  <div className="relative w-full h-full rounded-full flex items-center justify-center">
                    <span className="text-3xl sm:text-4xl">📡</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">
                    Proximity Connect
                  </h3>
                  <p className="text-white/70 text-xs sm:text-sm mt-1">
                    AirDrop for translated conversations
                  </p>
                </div>
                <GlassCard variant="subtle" padding="sm" className="text-left">
                  <ul className="text-xs sm:text-sm text-white/70 space-y-1.5 sm:space-y-2">
                    <li className="flex items-start gap-1.5 sm:gap-2">
                      <span className="text-purple-400">📍</span>
                      Find nearby Entrevoz users
                    </li>
                    <li className="flex items-start gap-1.5 sm:gap-2">
                      <span className="text-purple-400">📡</span>
                      Connect instantly with one tap
                    </li>
                    <li className="flex items-start gap-1.5 sm:gap-2">
                      <span className="text-purple-400">🌍</span>
                      Auto-translate between languages
                    </li>
                  </ul>
                </GlassCard>
                <button
                  onClick={() => router.push("/proximity")}
                  className="w-full py-3 sm:py-4 min-h-[48px] sm:min-h-[56px] bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-xl sm:rounded-2xl text-white font-semibold text-base sm:text-lg transition-all duration-200 shadow-2xl shadow-purple-500/25 hover:-translate-y-0.5"
                  aria-label="Start Proximity Connect - Find nearby Entrevoz users"
                >
                  📡 Start Proximity Discovery
                </button>
                <p className="text-xs text-white/70">
                  Location shared only while app is open
                </p>
              </div>
            ) : (
              <>
                {/* True Face-to-Face Mode Button */}
                {activeTab === "talk" && (
                  <div className="mb-4">
                    <GlowButton
                      onClick={() => router.push("/face-to-face")}
                      variant="primary"
                      size="lg"
                      fullWidth
                      icon={<span>🗣️</span>}
                      aria-label="Start true face-to-face mode with one device"
                    >
                      True Face-to-Face (One Device)
                    </GlowButton>
                    <p className="text-xs text-white/70 text-center mt-2">
                      Place phone between two people - each speaks their
                      language
                    </p>
                  </div>
                )}

                {/* Description - Premium Glass */}
                <GlassCard
                  variant="subtle"
                  padding="sm"
                  className="mb-5 text-center"
                >
                  {activeTab === "video" ? (
                    <p className="text-white/70 text-sm">
                      <span className="text-voxxo-400 font-medium">
                        Video Call:
                      </span>{" "}
                      Remote calls with live translation
                    </p>
                  ) : (
                    <p className="text-white/70 text-sm">
                      <span className="text-voxxo-400 font-medium">
                        Remote Talk:
                      </span>{" "}
                      Each person uses their own phone
                    </p>
                  )}
                </GlassCard>

                {/* Name - Premium Glass Input */}
                <div className="mb-4">
                  <label className="block text-sm text-white/60 mb-2">
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    inputMode="text"
                    autoComplete="name"
                    autoCorrect="off"
                    autoCapitalize="words"
                    spellCheck={false}
                    enterKeyHint="next"
                    aria-label="Your name"
                    className="glass-input w-full px-4 py-3 rounded-xl text-white placeholder-white/30 text-base"
                  />
                </div>

                {/* Language - Multi-language grid */}
                <div className="mb-5">
                  <label className="block text-sm text-white/60 mb-2">
                    You Speak
                  </label>
                  <LanguageGrid value={language} onChange={setLanguage} />
                </div>

                {/* Start/Join Toggle - Premium Pills */}
                <div className="mb-4">
                  <SimplePillTabs
                    options={[
                      { id: "start", label: "Start New" },
                      { id: "join", label: "Join" },
                    ]}
                    value={mode}
                    onChange={(v) => setMode(v as "start" | "join")}
                    className="w-full"
                  />
                </div>

                {/* Action */}
                {mode === "start" ? (
                  <GlowButton
                    onClick={
                      activeTab === "video" ? startVideoCall : startTalkMode
                    }
                    variant="primary"
                    size="xl"
                    fullWidth
                    icon={<span>{activeTab === "video" ? "📹" : "💬"}</span>}
                    aria-label={
                      activeTab === "video"
                        ? "Start a new video call with translation"
                        : "Start a new conversation with translation"
                    }
                  >
                    {activeTab === "video"
                      ? "Start Video Call"
                      : "Start Conversation"}
                  </GlowButton>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) =>
                        setJoinCode(e.target.value.toUpperCase())
                      }
                      placeholder="Enter code"
                      maxLength={6}
                      inputMode="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      enterKeyHint="go"
                      aria-label="Enter join code"
                      className="glass-input w-full px-4 py-3 rounded-xl text-white text-center text-2xl tracking-[0.3em] placeholder-white/30 uppercase font-mono"
                    />
                    <GlowButton
                      onClick={
                        activeTab === "video" ? joinVideoCall : joinTalkMode
                      }
                      variant="secondary"
                      size="xl"
                      fullWidth
                      icon={<span>{activeTab === "video" ? "📹" : "💬"}</span>}
                      aria-label={
                        activeTab === "video"
                          ? "Join video call with code"
                          : "Join conversation with code"
                      }
                    >
                      {activeTab === "video"
                        ? "Join Call"
                        : "Join Conversation"}
                    </GlowButton>
                  </div>
                )}
              </>
            )}
          </div>
        </GlassCard>

        {/* Footer - Premium Minimal */}
        <div className="text-center mt-4 sm:mt-6 space-y-2 pb-2 safe-area-bottom">
          <p className="text-white/70 text-[10px] sm:text-xs">
            Chrome recommended •{" "}
            <a
              href="/status"
              className="text-voxxo-500 hover:text-voxxo-400 transition"
            >
              Status
            </a>
          </p>
          <div className="pt-2 border-t border-white/[0.06]">
            <a
              href="https://machinemindconsulting.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs text-white/70 hover:text-voxxo-400 transition"
            >
              <span>Powered by</span>
              <span className="font-semibold text-voxxo-500">MachineMind</span>
            </a>
          </div>
        </div>
      </div>
    </AnimatedBackground>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-void-DEFAULT flex items-center justify-center">
          <div className="text-center">
            <div className="relative w-14 h-14 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-voxxo-500/30" />
              <div className="absolute inset-0 rounded-full border-4 border-voxxo-500 border-t-transparent animate-spin" />
              <div className="absolute inset-2 rounded-full bg-voxxo-500/10 animate-pulse" />
            </div>
            <p className="text-white/70 text-sm">Loading Entrevoz...</p>
          </div>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
