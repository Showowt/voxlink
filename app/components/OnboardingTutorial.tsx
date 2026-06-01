"use client";

import { useState, useCallback, useRef, type FC, type TouchEvent } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// ONBOARDING TUTORIAL - First-time user walkthrough
// Full-screen overlay with 5 slides, swipe support, dot indicators
// Design: dark gradient + teal/blue accents matching Entrevoz brand
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

const STEPS: OnboardingStep[] = [
  {
    icon: "🗣️",
    title: "Welcome to Entrevoz",
    subtitle: "Your Voice. Any Language. Instantly.",
    details: [
      "Real-time translation for conversations",
      "Works in your browser -- no download needed",
      "50+ languages supported",
    ],
  },
  {
    icon: "⌨️",
    title: "Translate Anything",
    subtitle: "Type or speak -- get instant translations with verification.",
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
    title: "You're Ready!",
    subtitle: "Pick a language and start translating.",
    details: [
      "Chrome recommended for best experience",
      "Works on iPhone, Android, and desktop",
      "Your data stays private",
    ],
  },
];

const OnboardingTutorial: FC<OnboardingTutorialProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(
    null,
  );
  const [isAnimating, setIsAnimating] = useState(false);

  // Touch/swipe tracking
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  const isLastStep = currentStep === STEPS.length - 1;
  const step = STEPS[currentStep];

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
    if (currentStep < STEPS.length - 1) {
      animateSlide("left", () => setCurrentStep((s) => s + 1));
    }
  }, [currentStep, animateSlide]);

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
      aria-label="Onboarding tutorial"
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

      {/* Skip button */}
      <button
        onClick={() => onComplete()}
        className="absolute top-4 right-4 z-10 px-4 py-2 min-h-[44px] min-w-[44px] text-white/50 hover:text-white/80 text-sm font-medium rounded-xl transition-colors"
        style={{
          paddingTop: "env(safe-area-inset-top, 16px)",
        }}
        aria-label="Skip onboarding tutorial"
      >
        Skip
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
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => goToStep(i)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center"
                role="tab"
                aria-selected={i === currentStep}
                aria-label={`Go to step ${i + 1}`}
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
                aria-label="Start translating"
              >
                Start Translating
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
                aria-label="Make a call"
              >
                Make a Call
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
                  aria-label="Go to previous step"
                >
                  Back
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
                aria-label={currentStep === 0 ? "Get started" : "Go to next step"}
              >
                {currentStep === 0 ? "Get Started" : "Next"}
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
