// ═══════════════════════════════════════════════════════════════════════════════
// TRANSLATION HISTORY - localStorage-based history & phrasebook
// Stores recent translations and user-favorited phrases
// Max 200 items, FIFO when full
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = "entrevoz_history";
const MAX_ITEMS = 200;

export interface TranslationItem {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
  isFavorite: boolean;
}

/**
 * Generate a unique ID for a translation item
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Read all items from localStorage
 */
function readStorage(): TranslationItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as TranslationItem[];
  } catch {
    return [];
  }
}

/**
 * Write items to localStorage
 */
function writeStorage(items: TranslationItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("[TranslationHistory] Failed to write localStorage:", err);
  }
}

/**
 * Add a new translation to history.
 * Skips duplicate consecutive translations (same source+target text).
 * Enforces MAX_ITEMS via FIFO on non-favorite items.
 */
export function addTranslation(
  sourceText: string,
  translatedText: string,
  sourceLang: string,
  targetLang: string,
): TranslationItem | null {
  if (!sourceText.trim() || !translatedText.trim()) return null;

  const items = readStorage();

  // Skip if the most recent item has the same source and translated text
  if (items.length > 0) {
    const latest = items[0];
    if (
      latest.sourceText === sourceText.trim() &&
      latest.translatedText === translatedText.trim()
    ) {
      return null;
    }
  }

  const newItem: TranslationItem = {
    id: generateId(),
    sourceText: sourceText.trim(),
    translatedText: translatedText.trim(),
    sourceLang,
    targetLang,
    timestamp: Date.now(),
    isFavorite: false,
  };

  // Prepend new item
  items.unshift(newItem);

  // Enforce max items - remove oldest non-favorite items first
  if (items.length > MAX_ITEMS) {
    // Keep all favorites, trim oldest non-favorites
    const favorites = items.filter((item) => item.isFavorite);
    const nonFavorites = items.filter((item) => !item.isFavorite);
    const trimmedNonFavorites = nonFavorites.slice(
      0,
      MAX_ITEMS - favorites.length,
    );
    const combined = [...favorites, ...trimmedNonFavorites].sort(
      (a, b) => b.timestamp - a.timestamp,
    );
    writeStorage(combined);
    return newItem;
  }

  writeStorage(items);
  return newItem;
}

/**
 * Get full history (newest first)
 */
export function getHistory(): TranslationItem[] {
  return readStorage();
}

/**
 * Toggle favorite status on an item
 */
export function toggleFavorite(id: string): boolean {
  const items = readStorage();
  const item = items.find((i) => i.id === id);
  if (!item) return false;

  item.isFavorite = !item.isFavorite;
  writeStorage(items);
  return item.isFavorite;
}

/**
 * Delete a single item by ID
 */
export function deleteItem(id: string): boolean {
  const items = readStorage();
  const filtered = items.filter((i) => i.id !== id);
  if (filtered.length === items.length) return false;

  writeStorage(filtered);
  return true;
}

/**
 * Clear all non-favorite history items
 */
export function clearHistory(): void {
  const items = readStorage();
  const favorites = items.filter((item) => item.isFavorite);
  writeStorage(favorites);
}

/**
 * Get only favorited items (newest first)
 */
export function getFavorites(): TranslationItem[] {
  return readStorage().filter((item) => item.isFavorite);
}

/**
 * Search history by query string (matches source or translated text)
 */
export function searchHistory(query: string): TranslationItem[] {
  if (!query.trim()) return readStorage();

  const q = query.toLowerCase().trim();
  return readStorage().filter(
    (item) =>
      item.sourceText.toLowerCase().includes(q) ||
      item.translatedText.toLowerCase().includes(q),
  );
}
