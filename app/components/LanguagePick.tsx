"use client";

import { LANGUAGES, DEFAULT_LANGUAGES, getLanguage } from "@/app/lib/languages";

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE PICK — compact "I speak" selector used on /dial and the incoming-
// call overlay: quick chips for the common languages + a full dropdown for all
// 31. Selecting persists to entrevoz_lang so every surface stays in sync.
// ─────────────────────────────────────────────────────────────────────────────

const CHIP_CODES = DEFAULT_LANGUAGES.slice(0, 4); // en, es, fr, pt

export default function LanguagePick({
  value,
  onChange,
  accent = "#00E5A0",
}: {
  value: string;
  onChange: (code: string) => void;
  accent?: string;
}) {
  const inChips = CHIP_CODES.includes(value);
  return (
    <div className="flex items-stretch gap-1.5">
      {CHIP_CODES.map((code) => {
        const l = getLanguage(code);
        const active = value === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            className={`flex-1 rounded-xl border px-1 py-2 text-[11px] font-semibold transition-all min-h-[48px] ${
              active
                ? "bg-white/[0.10] text-white"
                : "border-white/10 bg-white/[0.04] text-white/60"
            }`}
            style={active ? { borderColor: `${accent}99`, background: `${accent}1a` } : undefined}
            aria-pressed={active}
          >
            <span className="block text-base leading-none mb-0.5">{l.flag}</span>
            {code.toUpperCase()}
          </button>
        );
      })}
      {/* Full list for the other 27 languages */}
      <div
        className={`relative flex-1 rounded-xl border min-h-[48px] ${
          !inChips ? "bg-white/[0.10]" : "border-white/10 bg-white/[0.04]"
        }`}
        style={!inChips ? { borderColor: `${accent}99`, background: `${accent}1a` } : undefined}
      >
        <select
          value={inChips ? "" : value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="More languages"
        >
          <option value="" disabled>
            More…
          </option>
          {LANGUAGES.filter((l) => !CHIP_CODES.includes(l.code)).map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.nativeName}
            </option>
          ))}
        </select>
        <div
          className={`pointer-events-none flex h-full w-full flex-col items-center justify-center text-[11px] font-semibold ${
            !inChips ? "text-white" : "text-white/60"
          }`}
        >
          <span className="block text-base leading-none mb-0.5">
            {!inChips ? getLanguage(value).flag : "🌐"}
          </span>
          {!inChips ? value.toUpperCase() : "More"}
        </div>
      </div>
    </div>
  );
}
