// ─────────────────────────────────────────────────────────────────────────────
// MIC PERMISSION — check + request helpers so calls never fail silently when
// the microphone was forgotten or denied. iOS WKWebView: a denial is permanent
// until the user flips Settings → Entrevoz → Microphone, so the UI must say so.
// ─────────────────────────────────────────────────────────────────────────────

export type MicPermissionState = "granted" | "denied" | "prompt" | "unknown";

export async function checkMicPermission(): Promise<MicPermissionState> {
  try {
    if (typeof navigator === "undefined") return "unknown";
    const perms = navigator.permissions as
      | { query?: (d: { name: string }) => Promise<{ state: string }> }
      | undefined;
    if (perms?.query) {
      // Safari/WKWebView may throw on the 'microphone' descriptor — treat as unknown.
      const res = await perms
        .query({ name: "microphone" })
        .catch(() => null);
      if (res?.state === "granted") return "granted";
      if (res?.state === "denied") return "denied";
      if (res?.state === "prompt") return "prompt";
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

// Actively (re)request the microphone. Resolves 'granted' on success (tracks
// are stopped immediately — this is a permission probe, not an acquisition),
// 'denied' on refusal, 'unknown' on other failures (no device, insecure ctx).
export async function requestMic(): Promise<MicPermissionState> {
  try {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return "unknown";
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch (err) {
    const name = (err as { name?: string })?.name || "";
    if (name === "NotAllowedError" || name === "SecurityError") return "denied";
    return "unknown";
  }
}

// True when running inside the native iOS shell (Settings-app instructions
// apply instead of browser site-settings).
export function isNativeShell(): boolean {
  try {
    return typeof navigator !== "undefined" && /EntrevozApp/i.test(navigator.userAgent);
  } catch {
    return false;
  }
}
