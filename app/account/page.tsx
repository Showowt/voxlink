"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmDeleteModal } from "@/app/components/ConfirmDeleteModal";

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT & PRIVACY — GDPR Data Export + Delete Account
// Compliant with GDPR Article 15 (Right of Access) and Article 17 (Right to Erasure)
// ═══════════════════════════════════════════════════════════════════════════════

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem("entrevoz_device_id");
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem("entrevoz_device_id", id);
  return id;
}

interface ExportData {
  deviceId: string;
  exportedAt: string;
  clientData: {
    settings: Record<string, string | null>;
    translationHistory: unknown[];
    callHistory: unknown[];
  };
  serverData: {
    languageProgress: unknown[];
    srsCards: unknown[];
    entrevozImports: unknown[];
    contacts: unknown[];
  } | null;
}

function gatherClientData(): ExportData["clientData"] {
  if (typeof window === "undefined") {
    return { settings: {}, translationHistory: [], callHistory: [] };
  }

  // Gather all localStorage keys related to Entrevoz
  const settings: Record<string, string | null> = {};
  const entrevozKeys = [
    "entrevoz_name",
    "entrevoz_lang",
    "entrevoz_device_id",
    "entrevoz_theme",
    "entrevoz_notifications",
    "entrevoz_onboarding_done",
  ];
  for (const key of entrevozKeys) {
    settings[key] = localStorage.getItem(key);
  }

  // Translation history from localStorage
  let translationHistory: unknown[] = [];
  try {
    const raw = localStorage.getItem("entrevoz_translations");
    if (raw) translationHistory = JSON.parse(raw);
  } catch {
    // Ignore parse errors
  }

  // Call history from localStorage
  let callHistory: unknown[] = [];
  try {
    const raw = localStorage.getItem("entrevoz_call_history");
    if (raw) callHistory = JSON.parse(raw);
  } catch {
    // Ignore parse errors
  }

  return { settings, translationHistory, callHistory };
}

async function clearAllIndexedDB(): Promise<void> {
  if (typeof window === "undefined" || !window.indexedDB) return;

  try {
    const databases = await window.indexedDB.databases();
    const deletePromises = databases
      .filter((db): db is IDBDatabaseInfo & { name: string } => !!db.name)
      .map(
        (db) =>
          new Promise<void>((resolve) => {
            const req = window.indexedDB.deleteDatabase(db.name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve(); // Resolve even on error
            req.onblocked = () => resolve();
          }),
      );
    await Promise.all(deletePromises);
  } catch {
    // Ignore errors -- best effort
  }
}

function clearAllLocalStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.clear();
}

export default function AccountPage() {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportSuccess, setExportSuccess] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  useEffect(() => {
    setDeviceId(getDeviceId());
  }, []);

  // ── Export Data ──────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!deviceId) return;

    setExporting(true);
    setExportError("");
    setExportSuccess(false);

    try {
      // Gather client-side data
      const clientData = gatherClientData();

      // Fetch server-side data
      let serverData: ExportData["serverData"] = null;
      try {
        const res = await fetch(
          `/api/account/export?deviceId=${encodeURIComponent(deviceId)}`,
        );
        if (res.ok) {
          const json = await res.json();
          serverData = json.serverData || null;
        }
      } catch {
        // Server data fetch failed -- still export client data
      }

      const exportPayload: ExportData = {
        deviceId,
        exportedAt: new Date().toISOString(),
        clientData,
        serverData,
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `entrevoz-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (err) {
      console.error("[Account Export]", err);
      setExportError("Failed to export data. Please try again.");
    } finally {
      setExporting(false);
    }
  }, [deviceId]);

  // ── Delete Data ─────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!deviceId) return;

    setDeleting(true);
    setDeleteError("");

    try {
      // Delete server-side data
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, confirmText: "DELETE" }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Delete request failed");
      }

      // Clear client-side data
      clearAllLocalStorage();
      await clearAllIndexedDB();

      setDeleteModalOpen(false);
      setDeleteSuccess(true);

      // Redirect to homepage after 3 seconds
      setTimeout(() => {
        router.push("/");
      }, 3000);
    } catch (err) {
      console.error("[Account Delete]", err);
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete data. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  }, [deviceId, router]);

  // ── Delete Success Screen ───────────────────────────────────────────────────
  if (deleteSuccess) {
    return (
      <div className="min-h-[100dvh] bg-[#060810] flex items-center justify-center px-4 safe-all">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">
            Data Deleted Successfully
          </h1>
          <p className="text-white/60 text-sm mb-4">
            All your data has been removed from our servers and this device.
          </p>
          <p className="text-white/40 text-xs">
            Redirecting to homepage...
          </p>
        </div>
      </div>
    );
  }

  // ── Main Page ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-[#060810] py-6 px-4 sm:py-10 sm:px-6 safe-all">
      <div className="max-w-lg mx-auto">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition mb-6 min-h-[44px]"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Entrevoz
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            Account & Privacy
          </h1>
          <p className="text-white/50 text-sm leading-relaxed">
            Manage your data. You have the right to access and delete all
            information we store about you.
          </p>
        </div>

        {/* ── Section 1: Export Data ────────────────────────────────────────── */}
        <div
          className="rounded-2xl border border-cyan-500/20 p-5 sm:p-6 mb-5"
          style={{
            background:
              "linear-gradient(135deg, rgba(6, 182, 212, 0.04) 0%, rgba(6, 182, 212, 0.01) 100%)",
            boxShadow:
              "0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-cyan-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Export Your Data
              </h2>
              <p className="text-white/50 text-sm mt-1">
                Download all your data in JSON format. Includes settings,
                translation history, contacts, learning progress, and
                flashcards.
              </p>
            </div>
          </div>

          {exportError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm">{exportError}</p>
            </div>
          )}

          {exportSuccess && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-emerald-400 text-sm">
                Data exported successfully. Check your downloads.
              </p>
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={exporting || !deviceId}
            className="w-full py-3.5 min-h-[44px] rounded-xl font-semibold text-base text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #06b6d4, #0891b2)",
              boxShadow:
                "0 4px 20px rgba(6, 182, 212, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
            }}
          >
            {exporting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Gathering your data...
              </span>
            ) : (
              "Export My Data"
            )}
          </button>

          <p className="text-white/30 text-xs mt-3 text-center">
            Limited to 3 exports per hour
          </p>
        </div>

        {/* ── Section 2: Delete Account ────────────────────────────────────── */}
        <div
          className="rounded-2xl border border-red-500/30 p-5 sm:p-6 mb-8"
          style={{
            background:
              "linear-gradient(135deg, rgba(239, 68, 68, 0.04) 0%, rgba(239, 68, 68, 0.01) 100%)",
            boxShadow:
              "0 4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.03)",
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                Delete My Account
              </h2>
              <p className="text-white/50 text-sm mt-1">
                Permanently delete all your data from our servers and this
                device. This includes contacts, learning progress, flashcards,
                and all local storage. This action cannot be undone.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm">{deleteError}</p>
            </div>
          )}

          <button
            onClick={() => setDeleteModalOpen(true)}
            disabled={!deviceId}
            className="w-full py-3.5 min-h-[44px] rounded-xl font-semibold text-base text-red-300 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:text-red-200 hover:border-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            Delete All My Data
          </button>

          <p className="text-white/30 text-xs mt-3 text-center">
            Limited to 1 delete request per hour
          </p>
        </div>

        {/* ── Device ID Info ────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-white/[0.06] p-4 mb-6 bg-white/[0.02]">
          <p className="text-white/40 text-xs mb-1">Your Device ID</p>
          <p className="text-white/70 text-xs font-mono break-all">
            {deviceId || "Loading..."}
          </p>
          <p className="text-white/30 text-[10px] mt-2">
            This anonymous identifier is how we associate your data. It is
            stored only on this device.
          </p>
        </div>

        {/* ── Footer Links ──────────────────────────────────────────────────── */}
        <div className="text-center space-y-3 pb-4">
          <div className="flex justify-center gap-5 text-sm">
            <Link
              href="/privacy"
              className="text-white/40 hover:text-cyan-400 transition"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-white/40 hover:text-cyan-400 transition"
            >
              Terms of Service
            </Link>
          </div>
          <p className="text-white/20 text-xs">
            &copy; {new Date().getFullYear()} MachineMind. All rights reserved.
          </p>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        open={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setDeleteError("");
        }}
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
