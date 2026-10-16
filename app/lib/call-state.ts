// Cross-page "am I in a LIVE call right now?" flag (one shared JS context —
// the overlay and the call pages live in the same SPA).
//
// The incoming-call overlay used ROUTE-based detection ("on /call/* = busy")
// to auto-decline rings. But users park on dead call screens constantly —
// the post-call summary, a Connection Failed screen, an abandoned lobby —
// and every one of those made the phone UNREACHABLE: each incoming ring was
// instantly auto-declined ("everytime i call it says call declined").
// Busy must mean a partner is actually connected, nothing else.

let inCall = false;

export function setInCall(v: boolean): void {
  if (inCall === v) return;
  inCall = v;
  try {
    window.dispatchEvent(new CustomEvent("entrevoz:in-call-changed", { detail: v }));
  } catch {
    /* non-browser */
  }
}

export function getInCall(): boolean {
  return inCall;
}
