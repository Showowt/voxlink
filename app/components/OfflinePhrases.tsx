"use client";

import { useState, useRef, useCallback } from "react";

const FEATURE_OFFLINE_PHRASES = true;

// ── ElevenLabs default voices per language (clean, native-sounding) ──────────
const VOICES: Record<string, string> = {
  en: "21m00Tcm4TlvDq8ikWAM", // Rachel
  es: "AZnzlk1XvdvUeBnXmlld", // Domi
  fr: "MF3mGyEYCl7XYWbV9V6O", // Elli
  de: "TxGEqnHWrfWFTfGW9XjX", // Josh
  it: "VR6AewLTigWG4xSOukaG", // Arnold
  pt: "pNInz6obpgDQGcFmaJgB", // Adam
  ja: "ThT5KcBeYPX3keUQqHPh", // Dorothy
  ko: "AZnzlk1XvdvUeBnXmlld", // Domi
  zh: "ThT5KcBeYPX3keUQqHPh", // Dorothy
  ar: "21m00Tcm4TlvDq8ikWAM", // Rachel
  ru: "pNInz6obpgDQGcFmaJgB", // Adam
  hi: "21m00Tcm4TlvDq8ikWAM", // Rachel
  lt: "MF3mGyEYCl7XYWbV9V6O", // Elli
  nl: "TxGEqnHWrfWFTfGW9XjX",
  pl: "pNInz6obpgDQGcFmaJgB",
  tr: "21m00Tcm4TlvDq8ikWAM",
  vi: "ThT5KcBeYPX3keUQqHPh",
  th: "ThT5KcBeYPX3keUQqHPh",
  id: "pNInz6obpgDQGcFmaJgB",
  uk: "pNInz6obpgDQGcFmaJgB",
  sv: "TxGEqnHWrfWFTfGW9XjX",
};

// ── Speech code mapping for browser TTS fallback ─────────────────────────────
const SPEECH_CODES: Record<string, string> = {
  en: "en-US", es: "es-ES", fr: "fr-FR", pt: "pt-BR", de: "de-DE",
  it: "it-IT", zh: "zh-CN", ja: "ja-JP", ko: "ko-KR", ar: "ar-SA",
  ru: "ru-RU", hi: "hi-IN", lt: "lt-LT", nl: "nl-NL", pl: "pl-PL",
  tr: "tr-TR", vi: "vi-VN", th: "th-TH", id: "id-ID", uk: "uk-UA",
  sv: "sv-SE",
};

interface OfflinePhrasesProps {
  visible: boolean;
  onDismiss: () => void;
  sourceLang: string;
  targetLang: string;
  onSpeak?: (text: string, lang: string) => void;
}

interface PhraseCategory {
  id: string;
  label: string;
  icon: string;
  phrases: { source: string; target: string }[];
}

const PHRASES: Record<string, PhraseCategory[]> = {
  "en-es": [
    {
      id: "emergency",
      label: "Emergency",
      icon: "🚨",
      phrases: [
        { source: "I need help", target: "Necesito ayuda" },
        { source: "Call the police", target: "Llame a la policia" },
        { source: "I need a doctor", target: "Necesito un doctor" },
        { source: "Where is the hospital?", target: "Donde esta el hospital?" },
        { source: "I'm lost", target: "Estoy perdido" },
        { source: "It's an emergency", target: "Es una emergencia" },
      ],
    },
    {
      id: "navigation",
      label: "Getting Around",
      icon: "🗺️",
      phrases: [
        { source: "Where is...?", target: "Donde esta...?" },
        { source: "How do I get to...?", target: "Como llego a...?" },
        { source: "How far is it?", target: "Que tan lejos esta?" },
        { source: "Turn left", target: "Gire a la izquierda" },
        { source: "Turn right", target: "Gire a la derecha" },
        { source: "Straight ahead", target: "Derecho" },
        { source: "Take me to this address", target: "Lleveme a esta direccion" },
      ],
    },
    {
      id: "food",
      label: "Food & Drink",
      icon: "🍽️",
      phrases: [
        { source: "The bill, please", target: "La cuenta, por favor" },
        { source: "A table for two", target: "Una mesa para dos" },
        { source: "I'm allergic to...", target: "Soy alergico a..." },
        { source: "No spicy, please", target: "Sin picante, por favor" },
        { source: "Water, please", target: "Agua, por favor" },
        { source: "This is delicious", target: "Esto esta delicioso" },
      ],
    },
    {
      id: "social",
      label: "Social",
      icon: "👋",
      phrases: [
        { source: "Nice to meet you", target: "Mucho gusto" },
        { source: "How are you?", target: "Como estas?" },
        { source: "What's your name?", target: "Como te llamas?" },
        { source: "I don't understand", target: "No entiendo" },
        { source: "Can you speak slower?", target: "Puedes hablar mas lento?" },
        { source: "Thank you very much", target: "Muchas gracias" },
        { source: "See you later", target: "Hasta luego" },
      ],
    },
  ],
  "es-en": [
    {
      id: "emergency",
      label: "Emergencia",
      icon: "🚨",
      phrases: [
        { source: "Necesito ayuda", target: "I need help" },
        { source: "Llame a la policia", target: "Call the police" },
        { source: "Necesito un doctor", target: "I need a doctor" },
        { source: "Donde esta el hospital?", target: "Where is the hospital?" },
        { source: "Estoy perdido", target: "I'm lost" },
        { source: "Es una emergencia", target: "It's an emergency" },
      ],
    },
    {
      id: "navigation",
      label: "Direcciones",
      icon: "🗺️",
      phrases: [
        { source: "Donde esta...?", target: "Where is...?" },
        { source: "Como llego a...?", target: "How do I get to...?" },
        { source: "Que tan lejos esta?", target: "How far is it?" },
        { source: "A la izquierda", target: "Turn left" },
        { source: "A la derecha", target: "Turn right" },
        { source: "Derecho", target: "Straight ahead" },
      ],
    },
    {
      id: "social",
      label: "Social",
      icon: "👋",
      phrases: [
        { source: "Mucho gusto", target: "Nice to meet you" },
        { source: "Como estas?", target: "How are you?" },
        { source: "No entiendo", target: "I don't understand" },
        { source: "Habla mas lento", target: "Speak slower" },
        { source: "Muchas gracias", target: "Thank you very much" },
        { source: "Hasta luego", target: "See you later" },
      ],
    },
  ],
};

export default function OfflinePhrases({
  visible,
  onDismiss,
  sourceLang,
  targetLang,
  onSpeak,
}: OfflinePhrasesProps) {
  const [activeCategory, setActiveCategory] = useState("emergency");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Play phrase with ElevenLabs, fall back to browser TTS ──────────────
  const handleSpeak = useCallback(
    async (text: string, lang: string, id: string) => {
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      // If already playing this phrase, just stop
      if (playingId === id) {
        setPlayingId(null);
        return;
      }

      setLoadingId(id);

      const langCode = lang.split("-")[0];
      const voiceId = VOICES[langCode] || VOICES.en;

      try {
        const res = await fetch("/api/language-os/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voiceId }),
        });

        if (!res.ok) throw new Error("TTS API failed");

        const data = await res.json();

        if (data.audioBase64) {
          const audio = new Audio(`data:audio/mpeg;base64,${data.audioBase64}`);
          audioRef.current = audio;
          setLoadingId(null);
          setPlayingId(id);

          audio.onended = () => {
            setPlayingId(null);
            audioRef.current = null;
          };
          audio.onerror = () => {
            setPlayingId(null);
            audioRef.current = null;
          };

          await audio.play();
          onSpeak?.(text, lang);
          return;
        }
        throw new Error("No audio data");
      } catch {
        // Fallback: browser speech synthesis
        setLoadingId(null);
        if (typeof window !== "undefined" && window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = SPEECH_CODES[langCode] || lang;
          utterance.rate = 0.85;
          setPlayingId(id);
          utterance.onend = () => setPlayingId(null);
          utterance.onerror = () => setPlayingId(null);
          window.speechSynthesis.speak(utterance);
          onSpeak?.(text, lang);
        } else {
          setPlayingId(null);
        }
      }
    },
    [playingId, onSpeak],
  );

  if (!FEATURE_OFFLINE_PHRASES || !visible) return null;

  const key = `${sourceLang}-${targetLang}`;
  const reverseKey = `${targetLang}-${sourceLang}`;
  const categories = PHRASES[key] || PHRASES[reverseKey] || PHRASES["en-es"];

  const category = categories.find((c) => c.id === activeCategory) || categories[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="w-full max-w-md max-h-[80vh] overflow-hidden mx-4 mb-4 md:mb-0 rounded-2xl flex flex-col"
        style={{
          background: "linear-gradient(180deg, #111114 0%, #0a0a0e 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div>
            <h2 className="text-white text-base font-semibold">Quick Phrases</h2>
            <p className="text-white/40 text-xs">Tap to hear — native voice</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-white/40 hover:text-white/70 transition-colors p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-3 py-2 overflow-x-auto overscroll-x-contain border-b border-white/5" style={{ WebkitOverflowScrolling: 'touch' }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? "bg-[#00C896]/15 text-[#00C896] border border-[#00C896]/30"
                  : "bg-white/5 text-white/50 border border-transparent"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Phrases list */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          {category.phrases.map((phrase, i) => {
            const id = `${category.id}-${i}`;
            const isPlaying = playingId === id;
            const isLoading = loadingId === id;
            return (
              <button
                key={id}
                onClick={() => handleSpeak(phrase.target, targetLang, id)}
                disabled={isLoading}
                className="w-full text-left p-3 rounded-xl transition-all active:scale-[0.98] min-h-[60px] flex items-center gap-3"
                style={{
                  background: isPlaying
                    ? "rgba(0,200,150,0.1)"
                    : "rgba(255,255,255,0.03)",
                  border: isPlaying
                    ? "1px solid rgba(0,200,150,0.3)"
                    : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {/* Speaker icon */}
                <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-white/5">
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-[#00C896]/30 border-t-[#00C896] rounded-full animate-spin" />
                  ) : isPlaying ? (
                    <svg className="w-4 h-4 text-[#00C896]" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="4" y="6" width="3" height="12" rx="1">
                        <animate attributeName="height" values="12;6;12" dur="0.6s" repeatCount="indefinite" />
                        <animate attributeName="y" values="6;9;6" dur="0.6s" repeatCount="indefinite" />
                      </rect>
                      <rect x="10.5" y="4" width="3" height="16" rx="1">
                        <animate attributeName="height" values="16;8;16" dur="0.6s" repeatCount="indefinite" begin="0.1s" />
                        <animate attributeName="y" values="4;8;4" dur="0.6s" repeatCount="indefinite" begin="0.1s" />
                      </rect>
                      <rect x="17" y="6" width="3" height="12" rx="1">
                        <animate attributeName="height" values="12;6;12" dur="0.6s" repeatCount="indefinite" begin="0.2s" />
                        <animate attributeName="y" values="6;9;6" dur="0.6s" repeatCount="indefinite" begin="0.2s" />
                      </rect>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M6.5 8.788v6.424a.5.5 0 00.757.429l4.986-3.212a.5.5 0 000-.858L7.257 8.36a.5.5 0 00-.757.429z" />
                    </svg>
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-sm">{phrase.source}</p>
                  <p className={`text-sm font-medium mt-0.5 ${isPlaying ? "text-[#00C896]" : "text-[#00C896]/70"}`}>
                    {phrase.target}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
