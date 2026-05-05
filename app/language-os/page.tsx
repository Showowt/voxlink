"use client";

import { useRouter } from "next/navigation";
import { getSupportedLanguages } from "../lib/language-os/engine";
import { BackButton } from "@/app/components/ui/BackButton";

export default function LanguageOSPage() {
  const router = useRouter();
  const languages = getSupportedLanguages();

  return (
    <div className="min-h-[100dvh] bg-[#06060a] flex flex-col safe-top safe-bottom">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full opacity-20 blur-[100px]"
          style={{ background: "radial-gradient(circle, rgba(0,200,150,0.4) 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full opacity-15 blur-[80px]"
          style={{ background: "radial-gradient(circle, rgba(0,100,255,0.3) 0%, transparent 70%)" }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 px-4 pt-4">
        <BackButton href="/" label="Home" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-8">
        {/* Title section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00C896]/10 border border-[#00C896]/20 mb-5">
            <div className="w-2 h-2 rounded-full bg-[#00C896] animate-pulse" />
            <span className="text-[#00C896] text-xs font-medium tracking-wide uppercase">AI-Powered</span>
          </div>
          <h1 className="text-white text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            Language OS
          </h1>
          <p className="text-white/40 text-sm sm:text-base max-w-xs mx-auto leading-relaxed">
            Practice with adaptive AI personas. Vocab from your real calls feeds in automatically.
          </p>
        </div>

        {/* Language cards */}
        <div className="grid gap-3 w-full max-w-sm">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                if (lang.available) {
                  router.push(`/language-os/${lang.code}`);
                }
              }}
              disabled={!lang.available}
              className="group flex items-center gap-4 p-4 sm:p-5 min-h-[72px] rounded-2xl transition-all duration-200 active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: lang.available
                  ? "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)"
                  : "rgba(255,255,255,0.02)",
                border: lang.available
                  ? "1px solid rgba(0,200,150,0.15)"
                  : "1px solid rgba(255,255,255,0.04)",
                boxShadow: lang.available
                  ? "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)"
                  : "none",
              }}
            >
              <div className="w-12 h-12 rounded-xl bg-white/[0.06] flex items-center justify-center border border-white/[0.08] group-hover:border-[#00C896]/20 transition-colors">
                <span className="text-2xl">{lang.flag}</span>
              </div>
              <div className="text-left flex-1">
                <p className="text-white font-semibold text-base">{lang.displayName}</p>
                <p className="text-white/35 text-sm">{lang.nativeName}</p>
              </div>
              {lang.available ? (
                <div className="w-8 h-8 rounded-full bg-[#00C896]/10 flex items-center justify-center group-hover:bg-[#00C896]/20 transition-colors">
                  <svg className="w-4 h-4 text-[#00C896]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              ) : (
                <span className="text-white/25 text-xs font-medium px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">Soon</span>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-white/15 text-xs">
            Part of Entrevoz — practice here, speak for real there.
          </p>
        </div>
      </div>
    </div>
  );
}
