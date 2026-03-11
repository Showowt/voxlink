"use client";

import { useState } from "react";
import Link from "next/link";
import { GlassCard } from "../components/ui/GlassCard";
import { GlowButton } from "../components/ui/GlowButton";
import { VoxxoLogo } from "../components/ui/VoxxoLogo";
import { AnimatedBackground } from "../components/ui/AnimatedBackground";

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING CONTENT - Client Component with Interactive Elements
// ═══════════════════════════════════════════════════════════════════════════════

interface PricingFeature {
  text: string;
  included: boolean;
}

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: PricingFeature[];
  cta: string;
  highlighted?: boolean;
  badge?: string;
}

const pricingTiers: PricingTier[] = [
  {
    name: "Free",
    price: "$0",
    period: "/forever",
    description: "Everything you need to get started",
    features: [
      { text: "VoxType (unlimited text translation)", included: true },
      { text: "VoxNote (unlimited voice memos)", included: true },
      { text: "Face-to-Face mode (unlimited)", included: true },
      { text: "10 Wingman sessions/month", included: true },
      { text: "30 languages", included: true },
    ],
    cta: "Start Free",
  },
  {
    name: "Pro",
    price: "$12.99",
    period: "/month",
    description: "Unlimited power for serious users",
    features: [
      { text: "Everything in Free", included: true },
      { text: "Unlimited Wingman AI coaching", included: true },
      { text: "AirPods stealth mode", included: true },
      { text: "Proximity Connect radar", included: true },
      { text: "Video Call translation", included: true },
      { text: "Priority AI responses", included: true },
      { text: "No ads, no limits", included: true },
    ],
    cta: "Upgrade to Pro",
    highlighted: true,
    badge: "Most Popular",
  },
];

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "What happens if I run out of free sessions?",
    answer:
      "Your Wingman sessions reset at the beginning of each month. You can continue using VoxType, VoxNote, and Face-to-Face modes without limits. To get unlimited Wingman sessions, upgrade to Pro.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, you can cancel your Pro subscription at any time. You will continue to have access to Pro features until the end of your billing period.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit and debit cards including Visa, Mastercard, American Express, and Discover. Payments are securely processed through Stripe.",
  },
];

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`w-5 h-5 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChevronIcon({
  isOpen,
  className = "",
}: {
  isOpen: boolean;
  className?: string;
}) {
  return (
    <svg
      className={`w-5 h-5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function PricingCard({ tier }: { tier: PricingTier }) {
  const handleUpgrade = async () => {
    // Navigate to checkout - will POST to create session
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/stripe/checkout";
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <div
      className={`relative ${tier.highlighted ? "transform scale-[1.02]" : ""}`}
    >
      {/* Badge */}
      {tier.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="px-4 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-cyan-400 to-voxxo-500 text-void-DEFAULT shadow-lg">
            {tier.badge}
          </span>
        </div>
      )}

      <GlassCard
        variant={tier.highlighted ? "elevated" : "default"}
        padding="lg"
        glow={tier.highlighted ? "voxxo" : "none"}
        className={`h-full ${tier.highlighted ? "border-voxxo-500/30" : ""}`}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h3 className="text-xl font-bold text-white font-syne mb-2">
            {tier.name}
          </h3>
          <div className="flex items-baseline justify-center gap-1">
            <span className="text-4xl font-bold text-white font-syne">
              {tier.price}
            </span>
            <span className="text-white/60 text-sm">{tier.period}</span>
          </div>
          <p className="text-white/60 text-sm mt-2">{tier.description}</p>
        </div>

        {/* Features */}
        <ul className="space-y-3 mb-8">
          {tier.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3">
              <CheckIcon
                className={
                  tier.highlighted ? "text-voxxo-400" : "text-white/60"
                }
              />
              <span className="text-white/90 text-sm">{feature.text}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        {tier.highlighted ? (
          <GlowButton
            onClick={handleUpgrade}
            variant="primary"
            size="lg"
            fullWidth
            className="min-h-[56px]"
          >
            {tier.cta}
          </GlowButton>
        ) : (
          <Link href="/" className="block">
            <GlowButton
              variant="secondary"
              size="lg"
              fullWidth
              className="min-h-[56px]"
            >
              {tier.cta}
            </GlowButton>
          </Link>
        )}
      </GlassCard>
    </div>
  );
}

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="mt-16 sm:mt-20">
      <h2 className="text-2xl sm:text-3xl font-bold text-white text-center font-syne mb-8">
        Frequently Asked Questions
      </h2>
      <div className="max-w-2xl mx-auto space-y-4">
        {faqs.map((faq, index) => (
          <GlassCard key={index} variant="subtle" padding="none">
            <button
              onClick={() => toggleFAQ(index)}
              className="w-full px-5 py-4 flex items-center justify-between text-left min-h-[56px]"
              aria-expanded={openIndex === index}
              aria-controls={`faq-answer-${index}`}
            >
              <span className="text-white font-medium pr-4">
                {faq.question}
              </span>
              <ChevronIcon
                isOpen={openIndex === index}
                className="text-white/60 flex-shrink-0"
              />
            </button>
            <div
              id={`faq-answer-${index}`}
              className={`overflow-hidden transition-all duration-300 ${
                openIndex === index ? "max-h-48" : "max-h-0"
              }`}
            >
              <p className="px-5 pb-4 text-white/70 text-sm leading-relaxed">
                {faq.answer}
              </p>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

export default function PricingContent() {
  return (
    <AnimatedBackground
      variant="mesh"
      className="min-h-screen py-8 sm:py-12 px-4 overflow-y-auto"
    >
      <div className="max-w-4xl mx-auto">
        {/* Back to Home */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors min-h-[44px] px-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Voxxo
          </Link>
        </div>

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <VoxxoLogo size="md" animate showBrand />
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white font-syne mb-4 text-fluid-hero">
            Your voice. Any language.{" "}
            <span className="text-gradient-voxxo">Pick your power.</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/70 font-dm">
            Start free. Upgrade when you need more.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 sm:gap-8 mb-12">
          {pricingTiers.map((tier, index) => (
            <PricingCard key={index} tier={tier} />
          ))}
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap justify-center gap-4 sm:gap-8 mb-12 text-white/50 text-sm">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Secure Payments
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Cancel Anytime
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            Powered by Stripe
          </div>
        </div>

        {/* FAQ Section */}
        <FAQSection />

        {/* Footer */}
        <div className="text-center mt-16 pb-8 safe-area-bottom">
          <div className="divider mb-6" />
          <p className="text-white/50 text-sm mb-2">
            Questions?{" "}
            <a
              href="mailto:support@voxxo.app"
              className="text-voxxo-500 hover:text-voxxo-400 transition"
            >
              Contact Support
            </a>
          </p>
          <a
            href="https://machinemindconsulting.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-voxxo-400 transition"
          >
            Powered by{" "}
            <span className="font-semibold text-voxxo-500">MachineMind</span>
          </a>
        </div>
      </div>
    </AnimatedBackground>
  );
}
