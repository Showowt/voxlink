// ═══════════════════════════════════════════════════════════════════════════════
// ENTREVOZ APP SETTINGS UTILITY
// Persists user preferences in localStorage with typed interface
// ═══════════════════════════════════════════════════════════════════════════════

const SETTINGS_KEY = "entrevoz_settings";

export interface AppSettings {
  primaryLanguage: string;
  targetLanguage: string;
  autoDetectLanguage: boolean;
  autoPlayTTS: boolean;
  ttsSpeed: number;
  voiceDubbingEnabled: boolean;
  autoJoinCalls: boolean;
  showCaptions: boolean;
  captionFontSize: "small" | "medium" | "large";
  cyranoEnabled: boolean;
  saveHistory: boolean;
  autoSaveContacts: boolean;
  analyticsOptOut: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  primaryLanguage: "en",
  targetLanguage: "es",
  autoDetectLanguage: true,
  autoPlayTTS: true,
  ttsSpeed: 1.0,
  voiceDubbingEnabled: true,
  autoJoinCalls: true,
  showCaptions: true,
  captionFontSize: "medium",
  cyranoEnabled: true,
  saveHistory: true,
  autoSaveContacts: true,
  analyticsOptOut: false,
};

export function getSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };

  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(stored) as Partial<AppSettings>;
    // Merge with defaults to handle new fields added in future versions
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function updateSettings(partial: Partial<AppSettings>): void {
  if (typeof window === "undefined") return;

  try {
    const current = getSettings();
    const updated = { ...current, ...partial };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("[Settings] Failed to save settings:", err);
  }
}

export function resetSettings(): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch (err) {
    console.error("[Settings] Failed to reset settings:", err);
  }
}
