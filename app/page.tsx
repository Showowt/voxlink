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
import { addTranslation } from "./lib/translation-history";
import { OnboardingTutorial } from "./components/OnboardingTutorial";
import { hasSeenOnboarding, completeOnboarding } from "./lib/onboarding";
// Premium UI Components
import { AnimatedBackground } from "./components/ui/AnimatedBackground";
import { GlassCard } from "./components/ui/GlassCard";
import { GlowButton } from "./components/ui/GlowButton";
import { EntrevozLogo } from "./components/ui/EntrevozLogo";
import { SimplePillTabs } from "./components/ui/PillTabs";

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

        // Save to translation history
        addTranslation(text.trim(), data1.translation, sourceLang, targetLang);
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
          // Save to translation history
          addTranslation(text.trim(), data.translation, sourceLang, targetLang);
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

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!hasSeenOnboarding()) {
      setShowOnboarding(true);
    }
  }, []);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

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
  const [activeCategory, setActiveCategory] = useState<"translate" | "connect" | "tools">("translate");
  const [activeTab, setActiveTab] = useState<
    "video" | "talk" | "voxnote" | "voxtype" | "proximity" | "wingman" | "practice" | "group" | "contacts"
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
  const generateCode = useCallback(() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No O/0/I/1 for clarity
    const array = new Uint8Array(6);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => chars[byte % chars.length]).join("");
  }, []);

  // Persistent room code — generated once, reused across Copy/Share
  const [roomCode, setRoomCode] = useState(() => "");
  useEffect(() => {
    setRoomCode(generateCode());
  }, [generateCode]);

  // Dynamic origin for share links
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://entrevoz.co';

  // WhatsApp Call
  const [linkCopied, setLinkCopied] = useState(false);

  const startWhatsAppCall = () => {
    if (!name.trim()) { setToast({ message: "Please enter your name", type: "error" }); return; }
    const code = generateCode();
    const targetLang = language === "en" ? "es" : "en";
    const link = `${origin}/call/${code}?lang=${targetLang}`;
    const hostLink = `/call/${code}?host=true&name=${encodeURIComponent(name)}&lang=${language}`;
    const msg = encodeURIComponent(`Hey, I want to talk with live translation \u2014 tap to join our call \ud83c\udfa4\n${link}\n(No download needed \u2014 opens in your browser)`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
    setTimeout(() => router.push(hostLink), 800);
  };

  const shareCallLink = async () => {
    if (!name.trim()) { setToast({ message: "Please enter your name", type: "error" }); return; }
    const targetLang = language === "en" ? "es" : "en";
    const link = `${origin}/call/${roomCode}?lang=${targetLang}`;
    const hostLink = `/call/${roomCode}?host=true&name=${encodeURIComponent(name)}&lang=${language}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Entrevoz", text: `Join my translated call: ${link}`, url: link });
        router.push(hostLink);
      } catch (e) { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 3000);
    }
  };

  // Start Video Call
  const startVideoCall = () => {
    if (!name.trim()) {
      setToast({ message: "Please enter your name", type: "error" });
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
      setToast({ message: "Please enter your name", type: "error" });
      return;
    }
    if (!joinCode.trim() || joinCode.length !== 6) {
      setToast({ message: "Enter a 6-character room code", type: "error" });
      return;
    }
    router.push(
      `/call/${joinCode.toUpperCase()}?host=false&name=${encodeURIComponent(name)}&lang=${language}`,
    );
  };

  // Start Talk Mode
  const startTalkMode = () => {
    if (!name.trim()) {
      setToast({ message: "Please enter your name", type: "error" });
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
      setToast({ message: "Please enter your name", type: "error" });
      return;
    }
    if (!joinCode.trim() || joinCode.length !== 6) {
      setToast({ message: "Enter a 6-character room code", type: "error" });
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
        <div className="min-h-[100dvh] flex items-center justify-center p-4">
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

  // Category → feature mapping
  const categories = [
    { id: "translate" as const, label: "Translate" },
    { id: "connect" as const, label: "Connect" },
    { id: "tools" as const, label: "Tools" },
  ];

  const featuresByCategory = {
    translate: [
      { id: "voxtype" as const, label: "Type", desc: "Type & verify", icon: "⌨️" },
      { id: "voxnote" as const, label: "Voice", desc: "Voice note", icon: "🎤" },
    ],
    connect: [
      { id: "video" as const, label: "Video Call", desc: "1:1 video", icon: "📹" },
      { id: "talk" as const, label: "Talk", desc: "Text chat", icon: "💬" },
      { id: "group" as const, label: "Group", desc: "2-4 people", icon: "👥", isNew: true },
      { id: "contacts" as const, label: "Contacts", desc: "Favorites", icon: "⭐" },
    ],
    tools: [
      { id: "wingman" as const, label: "Wingman", desc: "AI earpiece", icon: "🎧" },
      { id: "proximity" as const, label: "Nearby", desc: "Find users", icon: "📡" },
      { id: "practice" as const, label: "Practice", desc: "Language OS", icon: "🧠" },
    ],
  };

  const currentFeatures = featuresByCategory[activeCategory];
  const activeFeature = currentFeatures.find(f => f.id === activeTab) || currentFeatures[0];

  return (
    <AnimatedBackground
      variant="mesh"
      className="flex flex-col py-3 px-3 sm:py-4 sm:px-4 sm:justify-center overflow-y-auto overscroll-contain max-h-[100dvh]"
    >
      {/* First-Time Onboarding */}
      {showOnboarding && (
        <OnboardingTutorial
          onComplete={(navigateTo) => {
            completeOnboarding();
            setShowOnboarding(false);
            if (navigateTo === "connect") {
              setActiveCategory("connect");
              setActiveTab("video");
            } else if (navigateTo === "translate") {
              setActiveCategory("translate");
              setActiveTab("voxtype");
            }
          }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg backdrop-blur-sm border max-w-[90vw] text-center transition-all animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-300' :
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300' :
          'bg-blue-500/20 border-blue-500/30 text-blue-300'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="w-full max-w-md mx-auto flex-shrink-0">
        {/* Logo + Settings Gear */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex-1">
            <EntrevozLogo size="md" animate showBrand />
          </div>
          <a
            href="/settings"
            aria-label="Settings"
            className="flex items-center justify-center w-10 h-10 min-w-[44px] min-h-[44px] rounded-xl text-white/40 hover:text-white/70 hover:bg-white/[0.06] active:scale-95 transition-all duration-200"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </a>
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
          className="overflow-x-hidden"
        >
          {/* Category Navigation */}
          <div className="border-b border-white/[0.06]">
            {/* Top: 3 category tabs */}
            <div className="flex">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    const first = featuresByCategory[cat.id][0];
                    if (first) setActiveTab(first.id);
                  }}
                  className={`flex-1 py-3 text-xs sm:text-sm font-medium tracking-wide transition-all relative ${
                    activeCategory === cat.id
                      ? "text-white"
                      : "text-white/40 hover:text-white/60"
                  }`}
                >
                  {cat.label}
                  {activeCategory === cat.id && (
                    <span className="absolute bottom-0 left-1/4 right-1/4 h-[2px] bg-[#00E5A0] rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Sub: feature pills within selected category */}
            <div className="flex gap-1.5 px-3 py-2.5 overflow-x-auto overscroll-x-contain scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
              {currentFeatures.map(feat => {
                const isActive = activeTab === feat.id;
                return (
                  <button
                    key={feat.id}
                    onClick={() => setActiveTab(feat.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 ${
                      isActive
                        ? "bg-white/[0.12] text-white border border-white/[0.15]"
                        : "text-white/50 hover:text-white/70 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="text-sm">{feat.icon}</span>
                    {feat.label}
                    {(feat as { isNew?: boolean }).isNew && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-[#00E5A0]/20 text-[#00E5A0] font-bold leading-none">NEW</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-3 sm:p-5">
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
            ) : activeTab === "group" ? (
              <div className="space-y-5 text-center">
                <div className="relative w-20 h-20 mx-auto">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-600/20 backdrop-blur-sm border border-teal-500/20" />
                  <div className="relative w-full h-full rounded-2xl flex items-center justify-center">
                    <span className="text-4xl">👥</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    Group Call
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[#00C896]/20 text-[#00C896] font-semibold align-middle">NEW</span>
                  </h3>
                  <p className="text-white/50 text-sm mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                    Up to 4 people speaking different languages, all understanding each other in real time
                  </p>
                </div>
                <div className="space-y-2.5 text-left">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-lg">🌍</span>
                    <span className="text-white/70 text-sm">Everyone speaks their own language</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-lg">💬</span>
                    <span className="text-white/70 text-sm">Real-time translated subtitles</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-lg">🔗</span>
                    <span className="text-white/70 text-sm">Share via WhatsApp or link</span>
                  </div>
                </div>
                <button
                  onClick={() => router.push("/group")}
                  className="w-full py-4 min-h-[52px] bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 rounded-2xl text-white font-semibold text-base transition-all duration-200 shadow-xl shadow-teal-500/20 hover:-translate-y-0.5 active:scale-[0.98]"
                  aria-label="Start Group Call"
                >
                  Start Group Call
                </button>
              </div>
            ) : activeTab === "contacts" ? (
              <div className="space-y-5 text-center">
                <div className="relative w-20 h-20 mx-auto">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 backdrop-blur-sm border border-amber-500/20" />
                  <div className="relative w-full h-full rounded-2xl flex items-center justify-center">
                    <span className="text-4xl">⭐</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Contacts</h3>
                  <p className="text-white/50 text-sm mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                    Your favorites and recent calls. Reconnect instantly with one tap.
                  </p>
                </div>
                <div className="space-y-2.5 text-left">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-lg">⭐</span>
                    <span className="text-white/70 text-sm">Pin favorites for instant access</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-lg">📞</span>
                    <span className="text-white/70 text-sm">Auto-saved after every call</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-lg">↗</span>
                    <span className="text-white/70 text-sm">Share invite links via WhatsApp</span>
                  </div>
                </div>
                <button
                  onClick={() => router.push("/contacts")}
                  className="w-full py-4 min-h-[52px] bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 rounded-2xl text-white font-semibold text-base transition-all duration-200 shadow-xl shadow-amber-500/20 hover:-translate-y-0.5 active:scale-[0.98]"
                  aria-label="View Contacts"
                >
                  View Contacts
                </button>
              </div>
            ) : activeTab === "practice" ? (
              <div className="space-y-5 text-center">
                <div className="relative w-20 h-20 mx-auto">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 backdrop-blur-sm border border-emerald-500/20" />
                  <div className="relative w-full h-full rounded-2xl flex items-center justify-center">
                    <span className="text-4xl">🧠</span>
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white tracking-tight">
                    Language OS
                  </h3>
                  <p className="text-white/50 text-sm mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                    AI-powered practice with adaptive personas and spaced repetition
                  </p>
                </div>
                <div className="space-y-2.5 text-left">
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-lg">🎭</span>
                    <span className="text-white/70 text-sm">Practice with AI personas</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-lg">📊</span>
                    <span className="text-white/70 text-sm">Vocab from your real calls</span>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-lg">🎯</span>
                    <span className="text-white/70 text-sm">Track fluency over time</span>
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => router.push("/language-os")}
                    className="flex-1 py-4 min-h-[52px] bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-2xl text-white font-semibold text-base transition-all duration-200 shadow-xl shadow-emerald-500/20 hover:-translate-y-0.5 active:scale-[0.98]"
                    aria-label="Start Language OS practice"
                  >
                    Start Practicing
                  </button>
                  <button
                    onClick={() => router.push("/english")}
                    className="py-4 px-4 min-h-[52px] bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 rounded-2xl text-white font-semibold text-sm transition-all duration-200 shadow-xl shadow-blue-500/20 hover:-translate-y-0.5 active:scale-[0.98] flex items-center gap-1.5"
                    aria-label="Learn English"
                  >
                    <span>Learn English</span>
                  </button>
                </div>
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
                {(activeTab === "talk" || activeTab === "video") && (
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

                {/* WhatsApp CTA - only on Call tab */}
                {activeTab === "video" && (
                  <div className="mb-4 space-y-3">
                    <button
                      onClick={startWhatsAppCall}
                      className="w-full flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-white text-lg transition-all hover:brightness-110 active:scale-[0.98]"
                      style={{ backgroundColor: "#25D366" }}
                    >
                      <span className="flex items-center justify-center w-8 h-8 rounded-full text-white font-extrabold text-sm" style={{ backgroundColor: "#128C7E" }}>W</span>
                      Call via WhatsApp
                    </button>
                    <div className="flex gap-3">
                      <button onClick={shareCallLink} className="flex-1 py-3 rounded-xl border border-white/10 bg-white/5 text-voxxo-400 font-semibold text-sm hover:bg-white/10 transition-all">
                        Share Link
                      </button>
                      <button onClick={() => { const link = `${origin}/call/${roomCode}?lang=${language === "en" ? "es" : "en"}`; navigator.clipboard.writeText(link); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 3000); }} className="flex-1 py-3 rounded-xl border border-white/10 bg-white/5 text-voxxo-400 font-semibold text-sm hover:bg-white/10 transition-all">
                        {linkCopied ? "Copied!" : "Copy Link"}
                      </button>
                    </div>
                    {/* Room Code Display */}
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-white/40 text-xs">Room:</span>
                      <span className="font-mono text-voxxo-400 text-sm font-semibold tracking-widest">{roomCode}</span>
                      <button
                        onClick={() => setRoomCode(generateCode())}
                        className="text-white/40 hover:text-white/70 transition-colors p-1 rounded-md hover:bg-white/5"
                        aria-label="Generate new room code"
                        title="New code"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                    <GlassCard variant="subtle" padding="sm">
                      <p className="text-voxxo-400 font-medium text-sm mb-1">How it works</p>
                      <p className="text-white/50 text-xs leading-relaxed">1. Share the link via WhatsApp or any app &bull; 2. They tap it &mdash; opens in browser &bull; 3. Live translated subtitles instantly. No download needed.</p>
                    </GlassCard>
                  </div>
                )}

                {/* Description - Talk tab only */}
                {activeTab === "talk" && (
                <GlassCard
                  variant="subtle"
                  padding="sm"
                  className="mb-5 text-center"
                >
                    <p className="text-white/70 text-sm">
                      <span className="text-voxxo-400 font-medium">
                        Remote Talk:
                      </span>{" "}
                      Each person uses their own phone
                    </p>
                </GlassCard>
                )}

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
              href="/history"
              className="text-voxxo-500 hover:text-voxxo-400 transition"
            >
              History
            </a>
            {" "}•{" "}
            <a
              href="/test"
              className="text-voxxo-500 hover:text-voxxo-400 transition"
            >
              Test
            </a>
            {" "}·{" "}
            <a
              href="/status"
              className="text-voxxo-500 hover:text-voxxo-400 transition"
            >
              Status
            </a>
            {" "}•{" "}
            <a
              href="/analytics"
              className="text-voxxo-500 hover:text-voxxo-400 transition"
            >
              Analytics
            </a>
            {" "}•{" "}
            <a
              href="/account"
              className="text-voxxo-500 hover:text-voxxo-400 transition"
            >
              Account & Privacy
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
        <div className="min-h-[100dvh] bg-void-DEFAULT flex items-center justify-center">
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
