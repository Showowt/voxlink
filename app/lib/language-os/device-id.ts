// Stable device ID that survives page refreshes

const STORAGE_KEY = "los_device_id";

export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.length === 36) return stored;
  } catch {
    // localStorage blocked
  }

  const id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Silent fail
  }

  return id;
}
