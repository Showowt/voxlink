// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK LANGUAGE CONFIGURATION
// Centralized language settings for speech recognition, translation, and UI
// ═══════════════════════════════════════════════════════════════════════════════

export interface Language {
  code: string; // ISO 639-1 code (e.g., 'en', 'es', 'fr')
  name: string; // English name
  nativeName: string; // Native language name
  flag: string; // Flag emoji
  speechCode: string; // BCP-47 locale for speech recognition (e.g., 'en-US')
  rtl?: boolean; // Right-to-left text direction
}

export const LANGUAGES: Language[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    flag: "🇺🇸",
    speechCode: "en-US",
  },
  {
    code: "es",
    name: "Spanish",
    nativeName: "Espanol",
    flag: "🇪🇸",
    speechCode: "es-ES",
  },
  {
    code: "fr",
    name: "French",
    nativeName: "Francais",
    flag: "🇫🇷",
    speechCode: "fr-FR",
  },
  {
    code: "pt",
    name: "Portuguese",
    nativeName: "Portugues",
    flag: "🇧🇷",
    speechCode: "pt-BR",
  },
  {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    flag: "🇩🇪",
    speechCode: "de-DE",
  },
  {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
    flag: "🇮🇹",
    speechCode: "it-IT",
  },
  {
    code: "zh",
    name: "Chinese",
    nativeName: "中文",
    flag: "🇨🇳",
    speechCode: "zh-CN",
  },
  {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    flag: "🇯🇵",
    speechCode: "ja-JP",
  },
  {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    flag: "🇰🇷",
    speechCode: "ko-KR",
  },
  {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    flag: "🇸🇦",
    speechCode: "ar-SA",
    rtl: true,
  },
  {
    code: "ru",
    name: "Russian",
    nativeName: "Русский",
    flag: "🇷🇺",
    speechCode: "ru-RU",
  },
  {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    flag: "🇮🇳",
    speechCode: "hi-IN",
  },
];

// Quick lookup by code
export const LANGUAGE_MAP: Record<string, Language> = LANGUAGES.reduce(
  (acc, lang) => {
    acc[lang.code] = lang;
    return acc;
  },
  {} as Record<string, Language>,
);

// Get language by code with fallback to English
export function getLanguage(code: string): Language {
  return LANGUAGE_MAP[code] || LANGUAGE_MAP["en"];
}

// Get speech recognition locale from language code
export function getSpeechCode(code: string): string {
  return getLanguage(code).speechCode;
}

// Get flag emoji from language code
export function getFlag(code: string): string {
  return getLanguage(code).flag;
}

// Check if language is RTL
export function isRTL(code: string): boolean {
  return getLanguage(code).rtl || false;
}

// Type for language code
export type LanguageCode = (typeof LANGUAGES)[number]["code"];

// Default languages for quick selection (most commonly used)
export const DEFAULT_LANGUAGES = ["en", "es", "fr", "pt", "de", "zh"];

// All language codes
export const ALL_LANGUAGE_CODES = LANGUAGES.map((l) => l.code);
