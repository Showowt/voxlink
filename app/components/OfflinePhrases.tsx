"use client";

import { useState } from "react";

const FEATURE_OFFLINE_PHRASES = true;

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
  const [spokenId, setSpokenId] = useState<string | null>(null);

  if (!FEATURE_OFFLINE_PHRASES || !visible) return null;

  const key = `${sourceLang}-${targetLang}`;
  const reverseKey = `${targetLang}-${sourceLang}`;
  const categories = PHRASES[key] || PHRASES[reverseKey] || PHRASES["en-es"];

  const category = categories.find((c) => c.id === activeCategory) || categories[0];

  const handleSpeak = (text: string, lang: string, id: string) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === "es" ? "es-CO" : lang;
      utterance.rate = 0.85;
      window.speechSynthesis.speak(utterance);
    }
    onSpeak?.(text, lang);
    setSpokenId(id);
    setTimeout(() => setSpokenId(null), 1500);
  };

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
            <p className="text-white/40 text-xs">Works offline — tap to speak</p>
          </div>
          <button
            onClick={onDismiss}
            className="text-white/40 hover:text-white/70 transition-colors p-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-white/5">
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
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {category.phrases.map((phrase, i) => {
            const id = `${category.id}-${i}`;
            const isSpoken = spokenId === id;
            return (
              <button
                key={id}
                onClick={() => handleSpeak(phrase.target, targetLang, id)}
                className="w-full text-left p-3 rounded-xl transition-all active:scale-[0.98]"
                style={{
                  background: isSpoken ? "rgba(0,200,150,0.1)" : "rgba(255,255,255,0.03)",
                  border: isSpoken ? "1px solid rgba(0,200,150,0.3)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <p className="text-white/80 text-sm">{phrase.source}</p>
                <p className="text-[#00C896] text-sm font-medium mt-0.5">
                  {isSpoken ? "🔊 " : "→ "}{phrase.target}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
