"use client";

import { useState, useCallback, useRef, type FC, type TouchEvent } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// ONBOARDING TUTORIAL - First-time user walkthrough
// Full-screen overlay with 5 slides, swipe support, dot indicators
// Design: dark gradient + teal/blue accents matching Entrevoz brand
//
// LOCALIZED (2026): EN / ES / PT. Auto-detects the visitor's browser language
// so non-English speakers understand it from the first frame, with a toggle to
// switch. Additive only — props + onComplete contract are unchanged, so every
// existing mount point (home, settings replay) keeps working.
// ═══════════════════════════════════════════════════════════════════════════════

interface OnboardingTutorialProps {
  onComplete: (navigateTo?: "translate" | "connect") => void;
}

interface OnboardingStep {
  icon: string;
  title: string;
  subtitle: string;
  details: string[];
}

export type OnboardingLang = "en" | "es" | "pt";

const UI_LANG_KEY = "entrevoz_ui_lang";

// ─── Per-language slide content ───────────────────────────────────────────────
const STEPS_BY_LANG: Record<OnboardingLang, OnboardingStep[]> = {
  en: [
    {
      icon: "🗣️",
      title: "Welcome to Entrevoz",
      subtitle: "Your Voice. Any Language. Instantly.",
      details: [
        "Real-time translation for conversations",
        "Works in your browser — no download needed",
        "50+ languages supported",
      ],
    },
    {
      icon: "⌨️",
      title: "Translate Anything",
      subtitle: "Type or speak — get instant translations with verification.",
      details: [
        "Back-translation verifies your meaning",
        "Voice-to-text for hands-free use",
        "Copy or share with one tap",
      ],
    },
    {
      icon: "📹",
      title: "Video Calls That Translate",
      subtitle: "Real-time captions in any language. Share a link to connect.",
      details: [
        "Live translated subtitles on video",
        "Send a link via WhatsApp or text",
        "No app install for your guest",
      ],
    },
    {
      icon: "🧠",
      title: "Learn While You Use",
      subtitle:
        "AI personas help you practice. Vocabulary from real calls feeds your flashcards.",
      details: [
        "Practice with AI conversation partners",
        "Spaced repetition flashcards",
        "Track your fluency over time",
      ],
    },
    {
      icon: "🚀",
      title: "Finding Your Way Around",
      subtitle: "Use the bottom tabs to navigate anywhere in the app.",
      details: [
        "Home — translate text & start calls",
        "Learn — practice with AI, History — past calls",
        "Profile — your settings & language",
      ],
    },
  ],
  es: [
    {
      icon: "🗣️",
      title: "Bienvenido a Entrevoz",
      subtitle: "Tu voz. Cualquier idioma. Al instante.",
      details: [
        "Traducción en tiempo real para conversaciones",
        "Funciona en tu navegador — sin descargas",
        "Más de 50 idiomas disponibles",
      ],
    },
    {
      icon: "⌨️",
      title: "Traduce cualquier cosa",
      subtitle: "Escribe o habla — traducciones instantáneas con verificación.",
      details: [
        "La retrotraducción verifica tu significado",
        "Voz a texto para usar sin manos",
        "Copia o comparte con un toque",
      ],
    },
    {
      icon: "📹",
      title: "Videollamadas que traducen",
      subtitle:
        "Subtítulos en tiempo real en cualquier idioma. Comparte un enlace para conectar.",
      details: [
        "Subtítulos traducidos en vivo en el video",
        "Envía un enlace por WhatsApp o mensaje",
        "Tu invitado no instala ninguna app",
      ],
    },
    {
      icon: "🧠",
      title: "Aprende mientras usas",
      subtitle:
        "Personas con IA te ayudan a practicar. El vocabulario de tus llamadas alimenta tus tarjetas.",
      details: [
        "Practica con compañeros de conversación con IA",
        "Tarjetas de repetición espaciada",
        "Sigue tu fluidez con el tiempo",
      ],
    },
    {
      icon: "🚀",
      title: "Cómo moverte por la app",
      subtitle: "Usa las pestañas de abajo para navegar por toda la app.",
      details: [
        "Inicio — traduce texto e inicia llamadas",
        "Aprender — practica con IA, Historial — llamadas pasadas",
        "Perfil — tus ajustes e idioma",
      ],
    },
  ],
  pt: [
    {
      icon: "🗣️",
      title: "Bem-vindo ao Entrevoz",
      subtitle: "Sua voz. Qualquer idioma. Na hora.",
      details: [
        "Tradução em tempo real para conversas",
        "Funciona no navegador — sem baixar nada",
        "Mais de 50 idiomas disponíveis",
      ],
    },
    {
      icon: "⌨️",
      title: "Traduza qualquer coisa",
      subtitle: "Digite ou fale — traduções instantâneas com verificação.",
      details: [
        "A retrotradução confere o seu significado",
        "Voz para texto, sem usar as mãos",
        "Copie ou compartilhe com um toque",
      ],
    },
    {
      icon: "📹",
      title: "Chamadas de vídeo que traduzem",
      subtitle:
        "Legendas em tempo real em qualquer idioma. Compartilhe um link para conectar.",
      details: [
        "Legendas traduzidas ao vivo no vídeo",
        "Envie um link pelo WhatsApp ou mensagem",
        "Seu convidado não instala nenhum app",
      ],
    },
    {
      icon: "🧠",
      title: "Aprenda enquanto usa",
      subtitle:
        "Personas de IA ajudam você a praticar. O vocabulário das suas chamadas abastece seus flashcards.",
      details: [
        "Pratique com parceiros de conversa com IA",
        "Flashcards de repetição espaçada",
        "Acompanhe sua fluência ao longo do tempo",
      ],
    },
    {
      icon: "🚀",
      title: "Como se orientar no app",
      subtitle: "Use as abas de baixo para navegar por todo o app.",
      details: [
        "Início — traduza texto e inicie chamadas",
        "Aprender — pratique com IA, Histórico — chamadas anteriores",
        "Perfil — suas configurações e idioma",
      ],
    },
  ],
};

// ─── Per-language UI strings ──────────────────────────────────────────────────
interface UIStrings {
  skip: string;
  back: string;
  next: string;
  getStarted: string;
  startTranslating: string;
  makeCall: string;
  ariaDialog: string;
  ariaLangGroup: string;
}

const UI: Record<OnboardingLang, UIStrings> = {
  en: {
    skip: "Skip",
    back: "Back",
    next: "Next",
    getStarted: "Get Started",
    startTranslating: "Start Translating",
    makeCall: "Make a Call",
    ariaDialog: "Onboarding tutorial",
    ariaLangGroup: "Tutorial language",
  },
  es: {
    skip: "Saltar",
    back: "Atrás",
    next: "Siguiente",
    getStarted: "Comenzar",
    startTranslating: "Traducir",
    makeCall: "Llamar",
    ariaDialog: "Tutorial de introducción",
    ariaLangGroup: "Idioma del tutorial",
  },
  pt: {
    skip: "Pular",
    back: "Voltar",
    next: "Próximo",
    getStarted: "Começar",
    startTranslating: "Traduzir",
    makeCall: "Ligar",
    ariaDialog: "Tutorial de introdução",
    ariaLangGroup: "Idioma do tutorial",
  },
};

const LANG_OPTIONS: OnboardingLang[] = ["en", "es", "pt"];
const LANG_LABEL: Record<OnboardingLang, string> = {
  en: "EN",
  es: "ES",
  pt: "PT",
};

// Detect the visitor's preferred language: stored choice → browser → English
function detectInitialLang(): OnboardingLang {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(UI_LANG_KEY);
    if (stored === "en" || stored === "es" || stored === "pt") return stored;
  } catch {
    /* ignore */
  }
  const nav = (
    navigator.language ||
    (navigator.languages && navigator.languages[0]) ||
    "en"
  ).toLowerCase();
  if (nav.startsWith("es")) return "es";
  if (nav.startsWith("pt")) return "pt";
  return "en";
}

const OnboardingTutorial: FC<OnboardingTutorialProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [lang, setLang] = useState<OnboardingLang>(detectInitialLang);
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(
    null,
  );
  const [isAnimating, setIsAnimating] = useState(false);

  // Touch/swipe tracking
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const steps = STEPS_BY_LANG[lang];
  const t = UI[lang];
  const isLastStep = currentStep === steps.length - 1;
  const step = steps[currentStep];

  const changeLang = useCallback((next: OnboardingLang) => {
    setLang(next);
    try {
      window.localStorage.setItem(UI_LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const animateSlide = useCallback(
    (direction: "left" | "right", callback: () => void) => {
      if (isAnimating) return;
      setIsAnimating(true);
      setSlideDirection(direction);

      // Wait for exit animation, then swap content and enter
      setTimeout(() => {
        callback();
        setSlideDirection(direction === "left" ? "right" : "left");

        // Trigger enter animation on next frame
        requestAnimationFrame(() => {
          setSlideDirection(null);
          setTimeout(() => setIsAnimating(false), 300);
        });
      }, 200);
    },
    [isAnimating],
  );

  const goNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      animateSlide("left", () => setCurrentStep((s) => s + 1));
    }
  }, [currentStep, steps.length, animateSlide]);

  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      animateSlide("right", () => setCurrentStep((s) => s - 1));
    }
  }, [currentStep, animateSlide]);

  const goToStep = useCallback(
    (index: number) => {
      if (index === currentStep || isAnimating) return;
      const direction = index > currentStep ? "left" : "right";
      animateSlide(direction, () => setCurrentStep(index));
    },
    [currentStep, isAnimating, animateSlide],
  );

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = e.targetTouches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    touchEndX.current = e.targetTouches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    const diffX = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(diffX) > minSwipeDistance) {
      if (diffX > 0) {
        // Swipe left -> next
        goNext();
      } else {
        // Swipe right -> prev
        goPrev();
      }
    }
  }, [goNext, goPrev]);

  // Slide transform based on animation direction
  const getSlideTransform = (): string => {
    if (slideDirection === "left") return "translateX(-60px)";
    if (slideDirection === "right") return "translateX(60px)";
    return "translateX(0)";
  };

  const getSlideOpacity = (): number => {
    return slideDirection ? 0 : 1;
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background:
          "linear-gradient(160deg, #060810 0%, #0a0f1a 40%, #0d1117 100%)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t.ariaDialog}
    >
      {/* Background glow effects */}
      <div
        className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(0, 200, 150, 0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(0, 102, 255, 0.06) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Language toggle (top-left) */}
      <div
        className="absolute top-4 left-4 z-10 flex items-center gap-1 p-1 rounded-xl"
        style={{
          paddingTop: "env(safe-area-inset-top, 4px)",
          background: "rgba(255, 255, 255, 0.05)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
        role="group"
        aria-label={t.ariaLangGroup}
      >
        {LANG_OPTIONS.map((code) => {
          const active = code === lang;
          return (
            <button
              key={code}
              onClick={() => changeLang(code)}
              className="min-w-[40px] min-h-[36px] px-2 rounded-lg text-xs font-bold transition-all"
              style={{
                background: active
                  ? "linear-gradient(135deg, #00C896 0%, #0066FF 100%)"
                  : "transparent",
                color: active ? "#060810" : "rgba(255,255,255,0.55)",
              }}
              aria-pressed={active}
              aria-label={LANG_LABEL[code]}
            >
              {LANG_LABEL[code]}
            </button>
          );
        })}
      </div>

      {/* Skip button */}
      <button
        onClick={() => onComplete()}
        className="absolute top-4 right-4 z-10 px-4 py-2 min-h-[44px] min-w-[44px] text-white/50 hover:text-white/80 text-sm font-medium rounded-xl transition-colors"
        style={{
          paddingTop: "env(safe-area-inset-top, 16px)",
        }}
        aria-label={t.skip}
      >
        {t.skip}
      </button>

      {/* Main content area */}
      <div
        className="relative w-full max-w-md mx-auto px-6 flex flex-col items-center"
        style={{ maxHeight: "100dvh", paddingTop: "8vh", paddingBottom: "8vh" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Slide content */}
        <div
          className="flex flex-col items-center text-center w-full"
          style={{
            transform: getSlideTransform(),
            opacity: getSlideOpacity(),
            transition: "transform 300ms ease-out, opacity 200ms ease-out",
          }}
        >
          {/* Icon */}
          <div className="relative mb-6 sm:mb-8">
            <div
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0, 200, 150, 0.15) 0%, rgba(0, 102, 255, 0.15) 100%)",
                border: "1px solid rgba(0, 200, 150, 0.2)",
                boxShadow:
                  "0 8px 32px rgba(0, 200, 150, 0.15), 0 0 60px rgba(0, 200, 150, 0.05)",
              }}
            >
              <span className="text-5xl sm:text-6xl">{step.icon}</span>
            </div>
            {/* Glow ring */}
            <div
              className="absolute -inset-2 rounded-[28px] animate-pulse pointer-events-none"
              style={{
                background:
                  "linear-gradient(135deg, rgba(0, 200, 150, 0.08) 0%, rgba(0, 102, 255, 0.08) 100%)",
                filter: "blur(12px)",
                animationDuration: "3s",
              }}
            />
          </div>

          {/* Title */}
          <h2
            className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-syne mb-3"
            style={{ textWrap: "balance" }}
          >
            {step.title}
          </h2>

          {/* Subtitle */}
          <p
            className="text-white/70 text-base sm:text-lg leading-relaxed max-w-[300px] mb-6 sm:mb-8"
            style={{ textWrap: "balance" }}
          >
            {step.subtitle}
          </p>

          {/* Detail bullets */}
          <div className="space-y-3 w-full max-w-[320px] mb-8 sm:mb-10">
            {step.details.map((detail, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-left px-4 py-3 rounded-xl"
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                  style={{
                    background:
                      "linear-gradient(135deg, #00C896 0%, #0066FF 100%)",
                    color: "#060810",
                  }}
                >
                  {i + 1}
                </span>
                <span className="text-white/60 text-sm">{detail}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom section: dots + CTA */}
        <div className="w-full flex flex-col items-center gap-6">
          {/* Dot indicators */}
          <div className="flex items-center gap-2.5" role="tablist" aria-label="Tutorial progress">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => goToStep(i)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center"
                role="tab"
                aria-selected={i === currentStep}
                aria-label={`${i + 1}`}
              >
                <span
                  className="block rounded-full transition-all duration-300"
                  style={{
                    width: i === currentStep ? "24px" : "8px",
                    height: "8px",
                    background:
                      i === currentStep
                        ? "linear-gradient(90deg, #00C896, #0066FF)"
                        : "rgba(255, 255, 255, 0.2)",
                  }}
                />
              </button>
            ))}
          </div>

          {/* CTA Buttons */}
          {isLastStep ? (
            <div className="flex gap-3 w-full max-w-[320px]">
              <button
                onClick={() => onComplete("translate")}
                className="flex-1 py-4 min-h-[52px] rounded-2xl text-white font-semibold text-base transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #00C896 0%, #0066FF 100%)",
                  boxShadow:
                    "0 4px 20px rgba(0, 200, 150, 0.25), 0 8px 40px rgba(0, 102, 255, 0.15)",
                }}
                aria-label={t.startTranslating}
              >
                {t.startTranslating}
              </button>
              <button
                onClick={() => onComplete("connect")}
                className="flex-1 py-4 min-h-[52px] rounded-2xl text-white/90 font-semibold text-base transition-all duration-200 hover:-translate-y-0.5 hover:text-white active:scale-[0.98]"
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  boxShadow:
                    "0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                }}
                aria-label={t.makeCall}
              >
                {t.makeCall}
              </button>
            </div>
          ) : (
            <div className="flex gap-3 w-full max-w-[320px]">
              {currentStep > 0 && (
                <button
                  onClick={goPrev}
                  className="py-4 px-6 min-h-[52px] rounded-2xl text-white/60 font-semibold text-base transition-all duration-200 hover:text-white/80 active:scale-[0.98]"
                  style={{
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                  aria-label={t.back}
                >
                  {t.back}
                </button>
              )}
              <button
                onClick={goNext}
                className="flex-1 py-4 min-h-[52px] rounded-2xl text-white font-semibold text-base transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #00C896 0%, #0066FF 100%)",
                  boxShadow:
                    "0 4px 20px rgba(0, 200, 150, 0.25), 0 8px 40px rgba(0, 102, 255, 0.15)",
                }}
                aria-label={currentStep === 0 ? t.getStarted : t.next}
              >
                {currentStep === 0 ? t.getStarted : t.next}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingTutorial;
export { OnboardingTutorial };
