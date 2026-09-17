// ─────────────────────────────────────────────────────────────────────────────
// AI CONSENT (App Review 5.1.1(i)/5.1.2(i))
// Translation requires sending the user's words to third-party AI services.
// Apple requires: disclose WHAT is sent and TO WHOM, and obtain permission
// BEFORE sending. This is the single source of truth for that consent.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = "entrevoz_ai_consent"; // "granted:<iso>" | "declined:<iso>"

export function getAIConsent(): "granted" | "declined" | "unset" {
  try {
    const v = localStorage.getItem(KEY) || "";
    if (v.startsWith("granted")) return "granted";
    if (v.startsWith("declined")) return "declined";
    return "unset";
  } catch {
    return "unset";
  }
}

export function setAIConsent(granted: boolean): void {
  try {
    localStorage.setItem(KEY, `${granted ? "granted" : "declined"}:${new Date().toISOString()}`);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent("entrevoz:ai-consent-changed", { detail: { granted } }),
    );
  } catch {
    /* ignore */
  }
}

// Call at every AI feature entry point (voice/text translate, calls).
// Returns true when the feature may proceed; otherwise opens the consent
// sheet and returns false (the user re-taps after agreeing).
export function ensureAIConsent(): boolean {
  if (getAIConsent() === "granted") return true;
  try {
    window.dispatchEvent(new Event("entrevoz:show-ai-consent"));
  } catch {
    /* ignore */
  }
  return false;
}
