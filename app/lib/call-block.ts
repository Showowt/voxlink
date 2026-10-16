// ═══════════════════════════════════════════════════════════════════════════════
// CALL BLOCK — local block list + inbound ring throttle.
//
// The ring address (device id / dial code) is designed to leave the device (QR,
// link), so a leaked address can be spam-rung. Until server-side ring auth
// exists, this lets a user SILENCE a caller and auto-suppresses a source that
// rings too often. Stored per-device in localStorage.
// ═══════════════════════════════════════════════════════════════════════════════

const BLOCK_KEY = "entrevoz_blocked";
const THROTTLE_MAX = 8; // rings allowed from one source… (retrying a call is NORMAL behavior — 3 silently ate the 4th attempt)
const THROTTLE_WINDOW = 60000; // …per 60s

function readBlocked(): string[] {
  try {
    const raw = localStorage.getItem(BLOCK_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function isBlocked(deviceId: string): boolean {
  if (!deviceId) return false;
  return readBlocked().includes(deviceId);
}

export function blockDevice(deviceId: string): void {
  if (!deviceId) return;
  try {
    const list = readBlocked();
    if (!list.includes(deviceId)) {
      list.push(deviceId);
      localStorage.setItem(BLOCK_KEY, JSON.stringify(list.slice(-500)));
    }
  } catch {
    /* ignore */
  }
}

export function unblockDevice(deviceId: string): void {
  try {
    localStorage.setItem(
      BLOCK_KEY,
      JSON.stringify(readBlocked().filter((d) => d !== deviceId)),
    );
  } catch {
    /* ignore */
  }
}

// In-memory sliding window of recent invite times per source device.
const recent = new Map<string, number[]>();

// Returns true if this source has rung too many times recently (spam) — the
// caller should suppress the ring.
export function isThrottled(deviceId: string, now: number): boolean {
  if (!deviceId) return false;
  const times = (recent.get(deviceId) ?? []).filter(
    (t) => now - t < THROTTLE_WINDOW,
  );
  // Over the limit: do NOT record this attempt. Recording while suppressed let
  // the caller's 2.5s re-ring loop re-saturate the window forever — a caller
  // who kept retrying (because calls "didn't ring") became PERMANENTLY
  // unreachable, with healthy ringback on their side the whole time.
  if (times.length >= THROTTLE_MAX) {
    recent.set(deviceId, times);
    return true;
  }
  times.push(now);
  recent.set(deviceId, times);
  return false;
}
