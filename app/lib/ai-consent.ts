// ─────────────────────────────────────────────────────────────────────────────
// AI CONSENT (App Review 5.1.1(i)/5.1.2(i))
// Translation requires sending the user's words to third-party AI services.
// Apple requires: disclose WHAT is sent and TO WHOM, and obtain permission
// BEFORE sending. This is the single source of truth for that consent.
//
// Enforcement is a CHOKEPOINT, not a checklist: installAIConsentGuard() wraps
// window.fetch so every request to a route that forwards user content to a
// third party is held until the user allows it — including surfaces that
// never call ensureAIConsent(). Per-feature ensureAIConsent() calls remain
// so the sheet opens at the moment a user taps an AI feature.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = "entrevoz_ai_consent"; // "granted:<iso>" | "declined:<iso>"
const CHANGED_EVENT = "entrevoz:ai-consent-changed";
const SHOW_EVENT = "entrevoz:show-ai-consent";

// Same-origin API routes that forward user content (voice, typed/spoken text,
// practice/coach messages, call vocabulary) to OpenAI, Anthropic, ElevenLabs
// or a translation service.
const AI_ROUTE =
  /^\/api\/(translate|translate-tone|transcribe|voice-dub|voice-clone|cyrano|language-os\/(chat|tts|entrevoz-bridge)|learning-insights|summary|cultural-context|detect-language)(\/|$)/;

// A decline this recent means the user just said no: requests that were
// already in flight are blocked quietly instead of re-opening the sheet.
const DECLINE_QUIET_MS = 15_000;

export const AI_CONSENT_BLOCKED_STATUS = 451;
export const AI_CONSENT_BLOCKED_MESSAGE =
  "Translation needs your permission to use AI services. · La traducción necesita tu permiso para usar servicios de IA.";

let lastDeclineAt = 0;
let pendingDecision: Promise<boolean> | null = null;
let showRequested = false;
let guardInstalled = false;

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
  if (!granted) lastDeclineAt = Date.now();
  try {
    localStorage.setItem(KEY, `${granted ? "granted" : "declined"}:${new Date().toISOString()}`);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(CHANGED_EVENT, { detail: { granted } }),
    );
  } catch {
    /* ignore */
  }
}

function requestShow(): void {
  showRequested = true;
  try {
    window.dispatchEvent(new Event(SHOW_EVENT));
  } catch {
    /* ignore */
  }
}

// The sheet calls this after it subscribes, so a request raised before it
// mounted (a page's mount-time fetch runs before AppShell's effects) is not
// lost.
export function consumeShowRequest(): boolean {
  const requested = showRequested;
  showRequested = false;
  return requested;
}

export function onShowAIConsent(handler: () => void): () => void {
  const listener = () => {
    showRequested = false;
    handler();
  };
  window.addEventListener(SHOW_EVENT, listener);
  return () => window.removeEventListener(SHOW_EVENT, listener);
}

// Call at every AI feature entry point (voice/text translate, calls).
// Returns true when the feature may proceed; otherwise opens the consent
// sheet and returns false (the user re-taps after agreeing).
export function ensureAIConsent(): boolean {
  if (getAIConsent() === "granted") return true;
  requestShow();
  return false;
}

export function isAIRequest(input: RequestInfo | URL): boolean {
  try {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && AI_ROUTE.test(url.pathname);
  } catch {
    return false;
  }
}

// Resolves once the user answers the sheet: true = allowed.
function awaitDecision(): Promise<boolean> {
  if (pendingDecision) return pendingDecision;
  if (Date.now() - lastDeclineAt < DECLINE_QUIET_MS) return Promise.resolve(false);
  pendingDecision = new Promise<boolean>((resolve) => {
    const onChange = (e: Event) => {
      window.removeEventListener(CHANGED_EVENT, onChange);
      pendingDecision = null;
      resolve(Boolean((e as CustomEvent<{ granted?: boolean }>).detail?.granted));
    };
    window.addEventListener(CHANGED_EVENT, onChange);
    requestShow();
  });
  return pendingDecision;
}

function blockedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: AI_CONSENT_BLOCKED_MESSAGE,
      consentRequired: true,
      translation: "",
      untranslated: true,
    }),
    {
      status: AI_CONSENT_BLOCKED_STATUS,
      headers: { "Content-Type": "application/json" },
    },
  );
}

// Idempotent. Installed at module load of the consent sheet (part of the root
// AppShell), before any page effect can issue a request.
export function installAIConsentGuard(): void {
  if (guardInstalled || typeof window === "undefined" || typeof window.fetch !== "function") return;
  guardInstalled = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isAIRequest(input) || getAIConsent() === "granted") {
      return nativeFetch(input, init);
    }
    const allowed = await awaitDecision();
    return allowed ? nativeFetch(input, init) : blockedResponse();
  };
}
