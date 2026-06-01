// ═══════════════════════════════════════════════════════════════════════════════
// RECORDING STORAGE — IndexedDB for blobs, localStorage for metadata
// Max 10 recordings, auto-deletes oldest when limit exceeded
// ═══════════════════════════════════════════════════════════════════════════════

const DB_NAME = "entrevoz-recordings";
const DB_VERSION = 1;
const STORE_NAME = "blobs";
const META_KEY = "entrevoz_recording_meta";
const MAX_RECORDINGS = 10;

export interface RecordingMeta {
  id: string;
  date: string; // ISO string
  partnerName: string;
  durationSeconds: number;
  languagePair: string; // e.g. "en / es"
  sizeBytes: number;
}

// ─── IndexedDB Helpers ───────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(blob, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function getBlob(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function deleteBlob(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// ─── Metadata (localStorage) ────────────────────────────────────────────────

function getMetaList(): RecordingMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? (JSON.parse(raw) as RecordingMeta[]) : [];
  } catch {
    return [];
  }
}

function setMetaList(list: RecordingMeta[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(META_KEY, JSON.stringify(list));
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function saveRecording(
  blob: Blob,
  meta: Omit<RecordingMeta, "id" | "sizeBytes">,
): Promise<string> {
  const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const list = getMetaList();

  // Enforce max limit — delete oldest first
  while (list.length >= MAX_RECORDINGS) {
    const oldest = list.pop();
    if (oldest) {
      try {
        await deleteBlob(oldest.id);
      } catch (err) {
        console.error("[RecordingStorage] Failed to delete oldest blob:", err);
      }
    }
  }

  // Store blob in IndexedDB
  await putBlob(id, blob);

  // Store metadata
  const entry: RecordingMeta = {
    id,
    date: meta.date,
    partnerName: meta.partnerName,
    durationSeconds: meta.durationSeconds,
    languagePair: meta.languagePair,
    sizeBytes: blob.size,
  };

  list.unshift(entry);
  setMetaList(list);

  return id;
}

export function listRecordings(): RecordingMeta[] {
  return getMetaList();
}

export async function getRecordingBlob(id: string): Promise<Blob | null> {
  try {
    return await getBlob(id);
  } catch (err) {
    console.error("[RecordingStorage] Failed to get blob:", err);
    return null;
  }
}

export async function deleteRecording(id: string): Promise<void> {
  try {
    await deleteBlob(id);
  } catch (err) {
    console.error("[RecordingStorage] Failed to delete blob:", err);
  }

  const list = getMetaList().filter((m) => m.id !== id);
  setMetaList(list);
}

export async function downloadRecordingById(id: string): Promise<void> {
  const blob = await getRecordingBlob(id);
  if (!blob) return;

  const meta = getMetaList().find((m) => m.id === id);
  const datePart = meta
    ? new Date(meta.date).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `entrevoz-call-${datePart}.webm`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
