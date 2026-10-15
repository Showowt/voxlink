// Reliable fire-and-forget POSTs for writes that must not be lost (contacts,
// call history). Previously these were bare `fetch(...).catch(() => {})` —
// any network blip, Supabase hiccup, or page teardown race silently dropped
// the write and the user saw "contacts don't save" / "history is empty".
//
// Now a failed write is queued in a localStorage outbox and retried on the
// next app load, on regaining connectivity, and when the app returns to the
// foreground. Server endpoints are upserts, so a retry after a success that
// we failed to observe is harmless.

const OUTBOX_KEY = "ev_outbox_v1";
const MAX_ENTRIES = 50;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // drop after a week

interface OutboxEntry {
  url: string;
  body: unknown;
  ts: number;
}

function readOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(entries: OutboxEntry[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* storage blocked — nothing more we can do */
  }
}

function enqueue(url: string, body: unknown): void {
  const entries = readOutbox();
  entries.push({ url, body, ts: Date.now() });
  writeOutbox(entries);
}

/**
 * POST JSON with keepalive. On network failure or a 5xx, the write is queued
 * and retried later. 4xx responses are NOT queued (retrying a rejected payload
 * forever just burns requests) but are logged so they're visible in debugging.
 */
export function reliablePost(url: string, body: unknown): Promise<boolean> {
  let payload: string;
  try {
    payload = JSON.stringify(body);
  } catch {
    return Promise.resolve(false);
  }
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  })
    .then((res) => {
      if (res.ok) return true;
      if (res.status >= 500) {
        enqueue(url, body);
      } else {
        console.error(`[reliablePost] ${url} rejected with ${res.status}`);
      }
      return false;
    })
    .catch(() => {
      enqueue(url, body);
      return false;
    });
}

let flushing = false;

/** Retry everything in the outbox. Safe to call repeatedly. */
export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  const entries = readOutbox();
  if (!entries.length) return;
  flushing = true;
  const now = Date.now();
  const remaining: OutboxEntry[] = [];
  for (const entry of entries) {
    if (now - entry.ts > MAX_AGE_MS) continue; // too old, drop
    try {
      const res = await fetch(entry.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry.body),
        keepalive: true,
      });
      if (!res.ok && res.status >= 500) remaining.push(entry);
      // ok or 4xx: done with this entry either way
    } catch {
      remaining.push(entry); // still offline — keep for next flush
    }
  }
  writeOutbox(remaining);
  flushing = false;
}

let flushHooksInstalled = false;

/** Install one-time listeners that flush the outbox at recovery moments. */
export function installOutboxFlush(): void {
  if (flushHooksInstalled || typeof window === "undefined") return;
  flushHooksInstalled = true;
  void flushOutbox();
  window.addEventListener("online", () => void flushOutbox());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushOutbox();
  });
}
