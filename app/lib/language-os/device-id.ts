// Stable device ID that survives page refreshes

const STORAGE_KEY = "los_device_id";

// In-memory fallback so a device whose localStorage is blocked or throws (Safari
// Private Mode, "Block all cookies", some WKWebView storage configs) keeps ONE
// stable id for the session instead of minting a fresh one on every call — which
// would scatter that user's contacts and history across many phantom ids.
let memoryId: string | null = null;

function makeId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Accept any previously-issued id (>= 8 chars) rather than requiring exactly
    // 36 — a stricter gate silently discarded valid ids and re-minted new ones.
    if (stored && stored.length >= 8) {
      memoryId = stored;
      return stored;
    }
  } catch {
    // localStorage blocked — fall through to the stable in-memory id.
  }

  if (memoryId) return memoryId;

  const id = makeId();
  memoryId = id;

  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Can't persist — the in-memory id keeps this session consistent.
  }

  return id;
}
