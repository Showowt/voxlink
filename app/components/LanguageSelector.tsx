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
        className={`flex items-center justify-center gap-1.5 sm:gap-2 p-2 sm:p-3 rounded-lg sm:rounded-xl bg-[#1a1a2e] border border-gray-700 text-white transition w-full ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:border-gray-600 cursor-pointer"
        }`}
      >
        <span className="text-lg sm:text-xl">{selectedLang.flag}</span>
        <span className="font-medium text-sm sm:text-base">
          {compact ? selectedLang.code.toUpperCase() : selectedLang.name}
        </span>
        {!disabled && (
          <svg
            className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
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
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#1a1a2e] border border-gray-700 rounded-xl shadow-xl max-h-64 overflow-y-auto">
          {availableLanguages.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => {
                onChange(lang.code);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition ${
                lang.code === value
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "text-white hover:bg-white/5"
              }`}
            >
              <span className="text-lg">{lang.flag}</span>
              <span className="flex-1 text-sm">{lang.name}</span>
              {lang.nativeName !== lang.name && (
                <span className="text-xs text-gray-500">{lang.nativeName}</span>
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
        className={`p-2 sm:p-3 rounded-lg sm:rounded-xl bg-[#1a1a2e] border border-gray-700 text-cyan-400 transition ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-cyan-500/10 hover:border-cyan-500/50"
        }`}
      >
        <svg
          className="w-4 h-4 sm:w-5 sm:h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
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
    <div className={`grid grid-cols-3 sm:grid-cols-4 gap-2 ${className}`}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          onClick={() => onChange(lang.code)}
          className={`p-2 sm:p-3 rounded-xl border-2 transition flex flex-col items-center justify-center gap-1 ${
            lang.code === value
              ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
              : "border-gray-700 bg-[#1a1a2e] text-gray-400 hover:border-gray-600"
          }`}
        >
          <span className="text-xl sm:text-2xl">{lang.flag}</span>
          <span className="text-[10px] sm:text-xs font-medium">
            {lang.code.toUpperCase()}
          </span>
        </button>
      ))}
    </div>
  );
}
