import type { LanguageConfig } from "./types";
import { esCoConfig } from "./configs/es-CO";
import { enLtConfig } from "./configs/en-lt";

const SUPPORTED_CONFIGS: Record<string, LanguageConfig> = {
  "en-es-CO": esCoConfig,
  "en-lt": enLtConfig,
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
