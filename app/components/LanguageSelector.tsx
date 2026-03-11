"use client";

import { useState, useRef, useEffect } from "react";
import { LANGUAGES, getLanguage, type Language } from "../lib/languages";

interface LanguageSelectorProps {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  excludeCode?: string; // Exclude a language (e.g., the other selected language)
  className?: string;
  compact?: boolean; // Show only flag + code in compact mode
}

export function LanguageSelector({
  value,
  onChange,
  disabled = false,
  excludeCode,
  className = "",
  compact = false,
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedLang = getLanguage(value);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const availableLanguages = LANGUAGES.filter((l) => l.code !== excludeCode);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        aria-label={`Select language, currently ${selectedLang.name}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`flex items-center justify-center gap-1.5 sm:gap-2 p-2 sm:p-3 rounded-xl backdrop-blur-md bg-white/[0.06] border border-white/[0.10] text-white transition-all duration-200 w-full ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-white/[0.10] hover:border-white/[0.15] cursor-pointer"
        }`}
      >
        <span className="text-lg sm:text-xl" aria-hidden="true">
          {selectedLang.flag}
        </span>
        <span className="font-medium text-sm sm:text-base text-white/90">
          {compact ? selectedLang.code.toUpperCase() : selectedLang.name}
        </span>
        {!disabled && (
          <svg
            className={`w-4 h-4 text-white/70 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute z-50 top-full left-0 right-0 mt-1 backdrop-blur-xl bg-void-elevated/95 border border-white/[0.12] rounded-xl shadow-2xl max-h-64 overflow-y-auto"
          role="listbox"
          aria-label="Available languages"
          style={{
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06)",
          }}
        >
          {availableLanguages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="option"
              aria-selected={lang.code === value}
              onClick={() => {
                onChange(lang.code);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors duration-150 ${
                lang.code === value
                  ? "bg-voxxo-500/20 text-voxxo-400"
                  : "text-white/80 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <span className="text-lg" aria-hidden="true">
                {lang.flag}
              </span>
              <span className="flex-1 text-sm">{lang.name}</span>
              {lang.nativeName !== lang.name && (
                <span className="text-xs text-white/70">{lang.nativeName}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Dual language selector (source + target with swap button)
interface DualLanguageSelectorProps {
  sourceLang: string;
  targetLang: string;
  onSourceChange: (code: string) => void;
  onTargetChange: (code: string) => void;
  onSwap: () => void;
  disabled?: boolean;
  compact?: boolean;
}

export function DualLanguageSelector({
  sourceLang,
  targetLang,
  onSourceChange,
  onTargetChange,
  onSwap,
  disabled = false,
  compact = true,
}: DualLanguageSelectorProps) {
  const sourceLanguage = getLanguage(sourceLang);
  const targetLanguage = getLanguage(targetLang);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <LanguageSelector
        value={sourceLang}
        onChange={onSourceChange}
        excludeCode={targetLang}
        disabled={disabled}
        compact={compact}
        className="flex-1"
      />

      <button
        type="button"
        onClick={onSwap}
        disabled={disabled}
        aria-label="Swap source and target languages"
        className={`p-2 sm:p-3 rounded-xl backdrop-blur-md bg-white/[0.06] border border-white/[0.10] text-voxxo-400 transition-all duration-200 ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-voxxo-500/10 hover:border-voxxo-500/30 hover:text-voxxo-300 hover:scale-105"
        }`}
      >
        <svg
          className="w-4 h-4 sm:w-5 sm:h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
        </svg>
      </button>

      <LanguageSelector
        value={targetLang}
        onChange={onTargetChange}
        excludeCode={sourceLang}
        disabled={disabled}
        compact={compact}
        className="flex-1"
      />
    </div>
  );
}

// Simple language grid for face-to-face/video call setup
interface LanguageGridProps {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}

export function LanguageGrid({
  value,
  onChange,
  className = "",
}: LanguageGridProps) {
  return (
    <div
      className={`grid grid-cols-3 sm:grid-cols-4 gap-2 ${className}`}
      role="radiogroup"
      aria-label="Select your language"
    >
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          role="radio"
          aria-checked={lang.code === value}
          aria-label={lang.name}
          onClick={() => onChange(lang.code)}
          className={`p-2 sm:p-3 rounded-xl border transition-all duration-200 flex flex-col items-center justify-center gap-1 backdrop-blur-sm ${
            lang.code === value
              ? "border-voxxo-500 bg-voxxo-500/15 text-voxxo-400 shadow-lg shadow-voxxo-500/10"
              : "border-white/[0.10] bg-white/[0.04] text-white/60 hover:border-white/[0.15] hover:bg-white/[0.08] hover:text-white/80"
          }`}
        >
          <span className="text-xl sm:text-2xl" aria-hidden="true">
            {lang.flag}
          </span>
          <span className="text-[10px] sm:text-xs font-medium">
            {lang.code.toUpperCase()}
          </span>
        </button>
      ))}
    </div>
  );
}
