// ═══════════════════════════════════════════════════════════════════════════════
// ONBOARDING STATE UTILITY
// Tracks whether user has completed the first-time onboarding tutorial
// Uses localStorage to persist across sessions
// ═══════════════════════════════════════════════════════════════════════════════

const ONBOARDING_KEY = "entrevoz_onboarding_complete";

export function hasSeenOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function completeOnboarding(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ONBOARDING_KEY, "true");
}

export function resetOnboarding(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ONBOARDING_KEY);
}
