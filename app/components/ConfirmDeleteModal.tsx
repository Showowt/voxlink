"use client";

import { useState, useEffect, useRef } from "react";

interface ConfirmDeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  loading = false,
}: ConfirmDeleteModalProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isConfirmEnabled = inputValue === "DELETE" && !loading;

  // Reset input when modal opens/closes
  useEffect(() => {
    if (open) {
      setInputValue("");
      // Focus the input after a brief delay for animation
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  // Close on escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-red-500/20 p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200"
        style={{
          background:
            "linear-gradient(135deg, rgba(20, 10, 15, 0.98) 0%, rgba(15, 5, 10, 0.98) 100%)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          boxShadow:
            "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 60px rgba(239, 68, 68, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        }}
      >
        {/* Warning Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2
          id="delete-modal-title"
          className="text-lg font-bold text-white text-center mb-2"
        >
          Delete All Your Data?
        </h2>

        {/* Description */}
        <p className="text-white/60 text-sm text-center mb-6 leading-relaxed">
          This will permanently delete all your data from our servers and clear
          everything stored on this device. This action cannot be undone.
        </p>

        {/* Confirmation Input */}
        <div className="mb-6">
          <label
            htmlFor="delete-confirm-input"
            className="block text-sm text-white/50 mb-2 text-center"
          >
            Type <span className="text-red-400 font-mono font-bold">DELETE</span> to
            confirm
          </label>
          <input
            ref={inputRef}
            id="delete-confirm-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            placeholder="DELETE"
            disabled={loading}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="w-full px-4 py-3 rounded-xl text-center text-lg font-mono tracking-widest text-white placeholder-white/20 bg-white/[0.06] border border-white/10 focus:border-red-500/50 focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all disabled:opacity-50"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 min-h-[44px] rounded-xl text-sm font-medium text-white/70 bg-white/[0.06] border border-white/10 hover:bg-white/[0.10] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!isConfirmEnabled}
            className="flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: isConfirmEnabled
                ? "linear-gradient(135deg, #ef4444, #dc2626)"
                : "rgba(239, 68, 68, 0.15)",
              boxShadow: isConfirmEnabled
                ? "0 4px 20px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)"
                : "none",
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Deleting...
              </span>
            ) : (
              "Delete Everything"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDeleteModal;
