"use client";

import { useRouter } from "next/navigation";
import { getSupportedLanguages } from "../lib/language-os/engine";

export default function LanguageOSPage() {
  const router = useRouter();
  const languages = getSupportedLanguages();

  return (
    <div className="min-h-screen bg-[#06060a] flex flex-col items-center justify-center p-6">
      <div className="text-center mb-12">
        <h1 className="text-white text-3xl md:text-4xl font-bold mb-3">Language OS</h1>
        <p className="text-white/50 text-sm md:text-base max-w-md mx-auto">
          AI-powered language practice with adaptive personas, spaced repetition, and real conversation integration.
        </p>
      </div>

      <div className="grid gap-4 w-full max-w-sm">
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => {
              if (lang.available) {
                router.push(`/language-os/${lang.code}`);
              }
            }}
            disabled={!lang.available}
            className="flex items-center gap-4 p-5 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-40"
            style={{
              background: lang.available ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
              border: lang.available ? "1px solid rgba(0,200,150,0.2)" : "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <span className="text-3xl">{lang.flag}</span>
            <div className="text-left flex-1">
              <p className="text-white font-semibold">{lang.displayName}</p>
              <p className="text-white/40 text-sm">{lang.nativeName}</p>
            </div>
            {lang.available ? (
              <svg className="w-5 h-5 text-[#00C896]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              <span className="text-white/30 text-xs">Coming soon</span>
            )}
          </button>
        ))}
      </div>

      <p className="text-white/20 text-xs mt-12">
        Part of Entrevoz — practice here, speak for real there.
      </p>
    </div>
  );
}
