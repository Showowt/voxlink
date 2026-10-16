// Call-chain diagnostic beacon. Fire-and-forget, never throws, never blocks.
// Emits one row per chain step so a failed call between two REAL devices can
// be read straight from the database instead of guessed from emulation:
//   caller:  invite-sent → joined-room → partner-connected | call-error
//   callee:  invite-received → invite-accepted|invite-declined → joined-room
//            → partner-connected
// plus auto-join-blocked (the iOS getUserMedia tap-gate).

import { getDeviceId } from "@/app/lib/language-os/device-id";

export function diag(
  step: string,
  detail?: Record<string, unknown> & { room?: string },
): void {
  try {
    const body = JSON.stringify({
      deviceId: getDeviceId(),
      step,
      room: detail?.room || null,
      detail: detail || null,
      ua: navigator.userAgent.includes("EntrevozApp") ? "ios-app" : "web",
      t: Date.now(),
    });
    fetch("/api/diag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* diagnostics must never break the product */
  }
}
