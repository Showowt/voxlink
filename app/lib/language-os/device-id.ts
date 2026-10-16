// Stable device ID that survives page refreshes, localStorage purges, and
// (in the native WKWebView shell) iOS storage-pressure evictions.
//
// Identity is the key under which ALL contacts and call history are stored
// server-side. Losing it doesn't delete the user's data — it strands it under
// an id the app no longer uses, which reads as "history doesn't store" and
// "contacts don't save". So the id is mirrored into three stores with
// different eviction behaviour, and recovered from any of them on boot:
//
//   1. localStorage  — fast, synchronous, but first to be purged (ITP, iOS
//                      storage pressure, "Block all cookies").
//   2. Cookie (400d) — WKWebView keeps cookies in the shared cookie store,
//                      which survives WebsiteDataStore purges that wipe
//                      localStorage. Also sent to the server on every request.
//   3. IndexedDB     — purged far less aggressively than localStorage on iOS.
//
// Conflict rule: the cookie/IDB mirrors are only ever written FROM an adopted
// identity, so if they disagree with localStorage it means localStorage was
// wiped and re-minted — the mirror holds the original identity that owns the
// user's data, and wins.

const STORAGE_KEY = "los_device_id";
const COOKIE_KEY = "ev_did";
const IDB_NAME = "entrevoz-identity";
const IDB_STORE = "kv";

// In-memory fallback so a device whose storage is fully blocked keeps ONE
// stable id for the session instead of minting a fresh one on every call.
let memoryId: string | null = null;

function makeId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isValidId(id: unknown): id is string {
  return typeof id === "string" && id.length >= 8 && id.length <= 64;
}

// ── Cookie mirror ────────────────────────────────────────────────────────────

function readCookieId(): string | null {
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${COOKIE_KEY}=([^;]+)`),
    );
    const value = match ? decodeURIComponent(match[1]) : null;
    return isValidId(value) ? value : null;
  } catch {
    return null;
  }
}

function writeCookieId(id: string): void {
  try {
    // 400 days = Chrome's hard cap on cookie lifetime; refreshed on every boot.
    document.cookie = `${COOKIE_KEY}=${encodeURIComponent(id)}; max-age=34560000; path=/; SameSite=Lax; Secure`;
  } catch {
    /* cookies blocked — other stores still cover us */
  }
}

// ── IndexedDB mirror ─────────────────────────────────────────────────────────

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          req.result.createObjectStore(IDB_STORE);
        } catch {
          /* already exists */
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readIdbId(): Promise<string | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get("device_id");
      req.onsuccess = () => {
        db.close();
        resolve(isValidId(req.result) ? req.result : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function writeIdbId(id: string): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(id, "device_id");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

// ── Known-ids history ────────────────────────────────────────────────────────
// A device's id can DRIFT (localStorage eviction → fresh mint → later restore).
// Callers store the id they saw (contacts, history, directory), so after drift
// the caller dials the OLD id while the phone listens only on the NEW one — the
// ring goes nowhere. Fix: remember EVERY id this device has used and listen on
// ALL of them (+ their dial codes). Append-only, capped, in localStorage.
const KNOWN_KEY = "los_known_ids";

function recordKnownId(id: string): void {
  if (!isValidId(id)) return;
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(KNOWN_KEY, JSON.stringify(list.slice(-10)));
    }
  } catch {
    /* storage blocked */
  }
}

/** Every device id this device is known to have used (current first). */
export function getKnownDeviceIds(): string[] {
  const ids = new Set<string>();
  try {
    const cur = getDeviceId();
    if (cur) ids.add(cur);
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    (raw ? (JSON.parse(raw) as string[]) : []).forEach((i) => {
      if (isValidId(i)) ids.add(i);
    });
  } catch {
    /* ignore */
  }
  const cookie = readCookieId();
  if (cookie) ids.add(cookie);
  if (memoryId) ids.add(memoryId);
  return Array.from(ids);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Accept any previously-issued id (>= 8 chars) rather than requiring exactly
    // 36 — a stricter gate silently discarded valid ids and re-minted new ones.
    if (stored && stored.length >= 8) {
      memoryId = stored;
      recordKnownId(stored);
      return stored;
    }
  } catch {
    // localStorage blocked — fall through to the stable in-memory id.
  }

  if (memoryId) return memoryId;

  // Before minting, try the synchronous cookie mirror — this alone recovers
  // identity when localStorage was purged but the page hasn't run the async
  // bootstrap yet.
  const fromCookie = readCookieId();
  if (fromCookie) {
    memoryId = fromCookie;
    try {
      localStorage.setItem(STORAGE_KEY, fromCookie);
    } catch {
      /* in-memory id keeps this session consistent */
    }
    recordKnownId(fromCookie);
    return fromCookie;
  }

  const id = makeId();
  memoryId = id;

  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Can't persist — the in-memory id keeps this session consistent.
  }
  writeCookieId(id);
  // Mint also seeds IndexedDB (a mint that wrote only the cookie could lose
  // reconciliation to a stale IDB value and permanently rebind identity).
  void writeIdbId(id);
  recordKnownId(id);

  return id;
}

/**
 * Async boot-time reconciliation across all three stores. Call once early
 * (AppShell). Returns the adopted id. If a durable mirror disagrees with
 * localStorage, the mirror wins (localStorage was wiped and re-minted) and a
 * "entrevoz:device-id-restored" event fires so mounted pages can refetch.
 */
export async function ensureStableDeviceId(): Promise<string> {
  let local: string | null = null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isValidId(stored)) local = stored;
  } catch {
    /* blocked */
  }

  const cookie = readCookieId();
  const idb = await readIdbId();

  // Remember EVERY id seen across mirrors — any of them may be an old id that
  // contacts/history still dial, so the listener must keep answering on it.
  [local, cookie, idb, memoryId].forEach((v) => v && recordKnownId(v));

  // Mirrors are only written from an adopted identity, so they outrank a
  // localStorage value they disagree with. Prefer IDB, then cookie, then local.
  const winner = idb || cookie || local || memoryId || makeId();
  const changed = memoryId !== null && memoryId !== winner;

  memoryId = winner;
  recordKnownId(winner);
  try {
    localStorage.setItem(STORAGE_KEY, winner);
  } catch {
    /* in-memory covers the session */
  }
  writeCookieId(winner);
  await writeIdbId(winner);

  if (changed) {
    try {
      window.dispatchEvent(
        new CustomEvent("entrevoz:device-id-restored", { detail: winner }),
      );
    } catch {
      /* non-browser context */
    }
  }

  return winner;
}
