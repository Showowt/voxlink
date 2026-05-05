import type { LanguageConfig } from "./types";
import { esCoConfig } from "./configs/es-CO";

const SUPPORTED_CONFIGS: Record<string, LanguageConfig> = {
  "en-es-CO": esCoConfig,
};

export function getLanguageConfig(languagePair: string): LanguageConfig | null {
  return SUPPORTED_CONFIGS[languagePair] ?? null;
}

export function getSupportedLanguages(): Array<{
  code: string;
  displayName: string;
  nativeName: string;
  flag: string;
  available: boolean;
}> {
  return Object.values(SUPPORTED_CONFIGS).map((c) => ({
    code: c.code,
    displayName: c.displayName,
    nativeName: c.nativeName,
    flag: c.flag,
    available: c.available,
  }));
}

export function isValidLanguagePair(code: string): boolean {
  return code in SUPPORTED_CONFIGS;
}
