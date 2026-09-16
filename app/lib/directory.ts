// ─────────────────────────────────────────────────────────────────────────────
// DIAL DIRECTORY (client helper)
// Publish this device's dial-code identity so a caller who only knows the short
// code can resolve it to a real device id + language — which is what lets us
// SAVE them as a contact and translate correctly when dialing by code.
// ─────────────────────────────────────────────────────────────────────────────

import { getDeviceId } from "@/app/lib/language-os/device-id";
import { deriveDialCode } from "@/app/lib/dial-code";

// Register / refresh this device in the directory. Fire-and-forget; safe to call
// on every app open and whenever the user's name changes.
export function registerDirectory(): void {
  try {
    const deviceId = getDeviceId();
    const dialCode = deriveDialCode(deviceId);
    if (!deviceId || !dialCode) return;
    const displayName = (localStorage.getItem("entrevoz_name") || "").trim();
    const language = localStorage.getItem("entrevoz_lang") || "en";
    fetch("/api/directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ deviceId, dialCode, displayName, language }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export interface ResolvedContact {
  deviceId: string;
  displayName: string | null;
  language: string;
}

// Resolve a dial code to a real device identity, or null if unknown / offline.
// Bounded by a short timeout so a slow directory never delays the actual call.
export async function resolveDialCode(
  code: string,
  timeoutMs = 1500,
): Promise<ResolvedContact | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/directory?code=${encodeURIComponent(code)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.found || !data?.deviceId) return null;
    return {
      deviceId: data.deviceId as string,
      displayName: (data.displayName ?? null) as string | null,
      language: (data.language || "en") as string,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
