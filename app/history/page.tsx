"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { BackButton } from "@/app/components/ui/BackButton";
import { getLanguage } from "@/app/lib/languages";
import {
  getHistory,
  getFavorites,
  toggleFavorite,
  deleteItem,
  clearHistory,
  searchHistory,
  type TranslationItem,
} from "@/app/lib/translation-history";

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSLATION HISTORY / PHRASEBOOK PAGE
// Recent translations + starred favorites with search & management
// ═══════════════════════════════════════════════════════════════════════════════

type TabType = "recent" | "favorites";

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function TranslationCard({
  item,
  onToggleFavorite,
  onDelete,
}: {
  item: TranslationItem;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [copied, setCopied] = useState(false);

  const sourceLang = getLanguage(item.sourceLang);
  const targetLang = getLanguage(item.targetLang);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = item.translatedText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="group relative rounded-2xl border border-white/[0.08] hover:border-white/[0.12] transition-all duration-200"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
      }}
    >
      <div className="p-3.5 sm:p-4">
        {/* Header: language pair + star + timestamp */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-white/50 flex items-center gap-1">
              <span>{sourceLang.flag}</span>
              <span className="text-white/30">-&gt;</span>
              <span>{targetLang.flag}</span>
            </span>
            <span className="text-[10px] sm:text-xs text-white/30">
              {formatTimestamp(item.timestamp)}
            </span>
          </div>

          <div className="flex items-center gap-1">
            {/* Star / Favorite */}
            <button
              onClick={() => onToggleFavorite(item.id)}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-all active:scale-90"
              aria-label={
                item.isFavorite
                  ? "Remove from favorites"
                  : "Add to favorites"
              }
            >
              <span
                className={`text-lg transition-all ${
                  item.isFavorite
                    ? "text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]"
                    : "text-white/25 hover:text-white/50"
                }`}
              >
                {item.isFavorite ? "\u2605" : "\u2606"}
              </span>
            </button>

            {/* More actions toggle */}
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-all text-white/30 hover:text-white/60"
              aria-label="More actions"
            >
              <svg
                className="w-4 h-4"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Source text */}
        <p className="text-white/60 text-xs sm:text-sm leading-relaxed mb-1.5">
          {item.sourceText}
        </p>

        {/* Translated text */}
        <p className="text-[#00C896] text-sm sm:text-base font-medium leading-relaxed">
          {item.translatedText}
        </p>

        {/* Action buttons (expanded) */}
        {showActions && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.06]">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-medium transition-all bg-white/[0.06] hover:bg-white/[0.10] text-white/70 hover:text-white active:scale-[0.97]"
              aria-label={copied ? "Copied!" : "Copy translation"}
            >
              <span>{copied ? "\u2713" : "\uD83D\uDCCB"}</span>
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-medium transition-all bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 active:scale-[0.97]"
              aria-label="Delete translation"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [tab, setTab] = useState<TabType>("recent");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<TranslationItem[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Load items based on tab and search
  const loadItems = useCallback(() => {
    if (query.trim()) {
      const results = searchHistory(query);
      if (tab === "favorites") {
        setItems(results.filter((i) => i.isFavorite));
      } else {
        setItems(results);
      }
    } else if (tab === "favorites") {
      setItems(getFavorites());
    } else {
      setItems(getHistory());
    }
  }, [tab, query]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleToggleFavorite = useCallback(
    (id: string) => {
      toggleFavorite(id);
      loadItems();
    },
    [loadItems],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteItem(id);
      loadItems();
    },
    [loadItems],
  );

  const handleClearAll = useCallback(() => {
    clearHistory();
    setShowClearConfirm(false);
    loadItems();
  }, [loadItems]);

  const recentCount = useMemo(() => getHistory().length, [items]);
  const favCount = useMemo(
    () => items.filter((i) => i.isFavorite).length + (tab !== "favorites" ? getFavorites().length - items.filter((i) => i.isFavorite).length : 0),
    [items, tab],
  );
  const favoritesCount = useMemo(() => getFavorites().length, [items]);

  return (
    <div className="min-h-[100dvh] bg-[#060810]">
      <div className="w-full max-w-md mx-auto px-4 py-4 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1">
            <BackButton href="/" />
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Translation History
            </h1>
          </div>

          {/* Clear All */}
          {tab === "recent" && recentCount > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs text-white/40 hover:text-red-400 transition-colors px-3 py-2 min-h-[44px] flex items-center rounded-lg hover:bg-white/[0.04]"
              aria-label="Clear all recent translations"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Clear Confirmation */}
        {showClearConfirm && (
          <div
            className="mb-4 rounded-2xl p-4 border border-red-500/20"
            style={{ background: "rgba(239, 68, 68, 0.08)" }}
          >
            <p className="text-white/80 text-sm mb-3">
              Clear all recent translations? Favorites will be kept.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleClearAll}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl text-sm font-medium bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-all active:scale-[0.97]"
              >
                Clear
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl text-sm font-medium bg-white/[0.06] hover:bg-white/[0.10] text-white/70 transition-all active:scale-[0.97]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative mb-4">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search translations..."
            className="w-full pl-10 pr-4 py-3 min-h-[44px] rounded-xl text-sm text-white placeholder-white/30 border border-white/[0.08] focus:border-[#00C896]/40 focus:outline-none transition-colors"
            style={{
              background: "rgba(255, 255, 255, 0.04)",
            }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-md text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-all"
              aria-label="Clear search"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Tab Toggle */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] mb-5">
          <button
            onClick={() => setTab("recent")}
            className={`flex-1 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all ${
              tab === "recent"
                ? "bg-white/[0.10] text-white border border-white/[0.10]"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            Recent
            {recentCount > 0 && (
              <span className="ml-1.5 text-[10px] text-white/30">
                {recentCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("favorites")}
            className={`flex-1 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
              tab === "favorites"
                ? "bg-white/[0.10] text-white border border-white/[0.10]"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            <span className="text-amber-400 text-xs">{"\u2605"}</span>
            Favorites
            {favoritesCount > 0 && (
              <span className="text-[10px] text-white/30">
                {favoritesCount}
              </span>
            )}
          </button>
        </div>

        {/* Translation List */}
        <div className="space-y-2.5">
          {items.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">
                {tab === "favorites" ? "\u2606" : "\uD83D\uDD4A\uFE0F"}
              </div>
              <p className="text-white/50 text-sm font-medium mb-1">
                {query
                  ? "No results found"
                  : tab === "favorites"
                    ? "No favorites yet"
                    : "No translations yet"}
              </p>
              <p className="text-white/30 text-xs">
                {query
                  ? "Try a different search term"
                  : tab === "favorites"
                    ? "Star translations to save them here"
                    : "Your translations will appear here"}
              </p>
            </div>
          ) : (
            items.map((item) => (
              <TranslationCard
                key={item.id}
                item={item}
                onToggleFavorite={handleToggleFavorite}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>

        {/* Footer spacing */}
        <div className="h-8" />
      </div>
    </div>
  );
}
