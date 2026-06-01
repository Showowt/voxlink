"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES } from "../lib/languages";
import {
  getSettings,
  updateSettings,
  resetSettings,
  type AppSettings,
} from "../lib/settings";
import { resetOnboarding } from "../lib/onboarding";

// ═══════════════════════════════════════════════════════════════════════════════
// TOGGLE SWITCH COMPONENT
// Custom styled toggle: teal when on, gray when off
// 44px min touch target
// ═══════════════════════════════════════════════════════════════════════════════

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-7 w-12 min-w-[48px] min-h-[44px] items-center shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-voxxo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060810]"
    >
      <span
        className={`absolute inset-0 top-1/2 -translate-y-1/2 h-7 w-12 rounded-full transition-colors duration-200 ${
          checked ? "bg-voxxo-500" : "bg-white/[0.12]"
        }`}
      />
      <span
        className={`relative inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTING ROW COMPONENT
// Consistent layout for label + control
// ═══════════════════════════════════════════════════════════════════════════════

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 min-h-[52px]">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/90 font-medium">{label}</p>
        {description && (
          <p className="text-xs text-white/40 mt-0.5">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION COMPONENT
// Grouped settings section with header
// ═══════════════════════════════════════════════════════════════════════════════

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3 px-1">
        {title}
      </h2>
      <div className="rounded-2xl bg-[#12121a] border border-white/[0.08] divide-y divide-white/[0.06] px-4">
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANGUAGE SELECT COMPONENT
// Dark styled dropdown using LANGUAGES master list
// ═══════════════════════════════════════════════════════════════════════════════

function LanguageSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="appearance-none bg-white/[0.08] border border-white/[0.10] rounded-xl px-3 py-2 text-sm text-white min-h-[44px] min-w-[140px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-voxxo-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060810] transition-colors hover:bg-white/[0.12]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.4)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 8px center",
        paddingRight: "32px",
      }}
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code} className="bg-[#12121a]">
          {lang.flag} {lang.name}
        </option>
      ))}
    </select>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [onboardingReset, setOnboardingReset] = useState(false);

  // Load settings on mount
  useEffect(() => {
    setSettings(getSettings());
  }, []);

  // Update a single setting
  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      if (!settings) return;
      const updated = { ...settings, [key]: value };
      setSettings(updated);
      updateSettings({ [key]: value });
    },
    [settings],
  );

  // Clear all data with confirmation
  const handleClearAllData = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.clear();
      resetSettings();
      setCleared(true);
      setShowClearConfirm(false);
      setTimeout(() => setCleared(false), 3000);
      // Reload settings to defaults
      setSettings(getSettings());
    } catch (err) {
      console.error("[Settings] Failed to clear data:", err);
    }
  }, []);

  // Handle reset onboarding
  const handleResetOnboarding = useCallback(() => {
    resetOnboarding();
    setOnboardingReset(true);
    setTimeout(() => setOnboardingReset(false), 3000);
  }, []);

  // Show loading skeleton while settings load
  if (!settings) {
    return (
      <div className="min-h-[100dvh] bg-[#060810] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-voxxo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#060810] safe-all">
      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.back()}
            className="group flex items-center justify-center w-10 h-10 min-w-[44px] min-h-[44px] rounded-xl text-white/60 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all duration-200"
            aria-label="Go back"
          >
            <svg
              className="w-5 h-5 transition-transform group-hover:-translate-x-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-white">Settings</h1>
        </div>

        {/* ═════════════ LANGUAGE PREFERENCES ═════════════ */}
        <Section title="Language Preferences">
          <SettingRow label="Primary Language" description="Your spoken language">
            <LanguageSelect
              value={settings.primaryLanguage}
              onChange={(v) => update("primaryLanguage", v)}
              label="Select primary language"
            />
          </SettingRow>
          <SettingRow
            label="Translation Target"
            description="Default language to translate into"
          >
            <LanguageSelect
              value={settings.targetLanguage}
              onChange={(v) => update("targetLanguage", v)}
              label="Select target language"
            />
          </SettingRow>
          <SettingRow
            label="Auto-detect language"
            description="Detect spoken language automatically"
          >
            <Toggle
              checked={settings.autoDetectLanguage}
              onChange={(v) => update("autoDetectLanguage", v)}
              label="Auto-detect language"
            />
          </SettingRow>
        </Section>

        {/* ═════════════ AUDIO & VOICE ═════════════ */}
        <Section title="Audio & Voice">
          <SettingRow
            label="Auto-play translations"
            description="Speak translations aloud (TTS)"
          >
            <Toggle
              checked={settings.autoPlayTTS}
              onChange={(v) => update("autoPlayTTS", v)}
              label="Auto-play translations"
            />
          </SettingRow>
          <SettingRow
            label="TTS voice speed"
            description={`${settings.ttsSpeed.toFixed(1)}x`}
          >
            <input
              type="range"
              min={0.8}
              max={1.2}
              step={0.1}
              value={settings.ttsSpeed}
              onChange={(e) => update("ttsSpeed", parseFloat(e.target.value))}
              aria-label="TTS voice speed"
              className="w-28 h-2 rounded-full appearance-none cursor-pointer bg-white/[0.12] accent-voxxo-500 min-h-[44px]"
            />
          </SettingRow>
          <SettingRow
            label="Voice dubbing"
            description="Enable voice dubbing on calls"
          >
            <Toggle
              checked={settings.voiceDubbingEnabled}
              onChange={(v) => update("voiceDubbingEnabled", v)}
              label="Voice dubbing enabled"
            />
          </SettingRow>
        </Section>

        {/* ═════════════ CALL PREFERENCES ═════════════ */}
        <Section title="Call Preferences">
          <SettingRow
            label="Auto-join as guest"
            description="Join calls automatically when invited"
          >
            <Toggle
              checked={settings.autoJoinCalls}
              onChange={(v) => update("autoJoinCalls", v)}
              label="Auto-join calls as guest"
            />
          </SettingRow>
          <SettingRow
            label="Show captions"
            description="Display captions by default"
          >
            <Toggle
              checked={settings.showCaptions}
              onChange={(v) => update("showCaptions", v)}
              label="Show captions by default"
            />
          </SettingRow>
          <SettingRow label="Caption font size">
            <div className="flex gap-1">
              {(["small", "medium", "large"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => update("captionFontSize", size)}
                  aria-label={`Caption font size ${size}`}
                  className={`px-3 py-1.5 min-h-[44px] rounded-xl text-xs font-medium capitalize transition-all duration-200 ${
                    settings.captionFontSize === size
                      ? "bg-voxxo-500/20 text-voxxo-400 border border-voxxo-500/30"
                      : "bg-white/[0.06] text-white/50 border border-transparent hover:bg-white/[0.10] hover:text-white/70"
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow
            label="Wingman / Cyrano"
            description="Enable AI coaching by default"
          >
            <Toggle
              checked={settings.cyranoEnabled}
              onChange={(v) => update("cyranoEnabled", v)}
              label="Cyrano/Wingman enabled by default"
            />
          </SettingRow>
        </Section>

        {/* ═════════════ PRIVACY & DATA ═════════════ */}
        <Section title="Privacy & Data">
          <SettingRow
            label="Save translation history"
            description="Keep a log of past translations"
          >
            <Toggle
              checked={settings.saveHistory}
              onChange={(v) => update("saveHistory", v)}
              label="Save translation history"
            />
          </SettingRow>
          <SettingRow
            label="Auto-save contacts"
            description="Save call contacts automatically"
          >
            <Toggle
              checked={settings.autoSaveContacts}
              onChange={(v) => update("autoSaveContacts", v)}
              label="Save call contacts automatically"
            />
          </SettingRow>
          <SettingRow
            label="Analytics opt-out"
            description="Stop sharing anonymous usage data"
          >
            <Toggle
              checked={settings.analyticsOptOut}
              onChange={(v) => update("analyticsOptOut", v)}
              label="Analytics opt-out"
            />
          </SettingRow>
        </Section>

        {/* ═════════════ ABOUT ═════════════ */}
        <Section title="About">
          <SettingRow label="Version">
            <span className="text-sm text-white/40 font-mono">
              Entrevoz v3.0
            </span>
          </SettingRow>

          <div className="py-3 space-y-3">
            {/* Reset Onboarding */}
            <button
              onClick={handleResetOnboarding}
              className="w-full py-3 min-h-[44px] rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm font-medium text-white/70 hover:bg-white/[0.10] hover:text-white/90 active:scale-[0.98] transition-all duration-200"
            >
              {onboardingReset ? "Onboarding Reset!" : "Reset Onboarding"}
            </button>

            {/* Clear All Data */}
            {showClearConfirm ? (
              <div className="flex gap-2">
                <button
                  onClick={handleClearAllData}
                  className="flex-1 py-3 min-h-[44px] rounded-xl bg-red-500/20 border border-red-500/30 text-sm font-medium text-red-400 hover:bg-red-500/30 active:scale-[0.98] transition-all duration-200"
                >
                  Confirm Clear
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 min-h-[44px] rounded-xl bg-white/[0.06] border border-white/[0.08] text-sm font-medium text-white/70 hover:bg-white/[0.10] active:scale-[0.98] transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full py-3 min-h-[44px] rounded-xl bg-red-500/10 border border-red-500/20 text-sm font-medium text-red-400/80 hover:bg-red-500/20 hover:text-red-400 active:scale-[0.98] transition-all duration-200"
              >
                {cleared ? "All Data Cleared!" : "Clear All Data"}
              </button>
            )}
          </div>

          {/* Links */}
          <div className="py-3 flex gap-4">
            <a
              href="/terms"
              className="text-sm text-voxxo-500 hover:text-voxxo-400 transition-colors min-h-[44px] flex items-center"
            >
              Terms of Service
            </a>
            <a
              href="/privacy"
              className="text-sm text-voxxo-500 hover:text-voxxo-400 transition-colors min-h-[44px] flex items-center"
            >
              Privacy Policy
            </a>
          </div>
        </Section>

        {/* Bottom spacer for safe area */}
        <div className="h-8 safe-area-bottom" />
      </div>
    </div>
  );
}
