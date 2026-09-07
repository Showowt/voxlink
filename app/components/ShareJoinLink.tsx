"use client";

import { useState } from "react";
import {
  copyText,
  shareJoinLink,
  whatsappShareUrl,
  type ShareResult,
} from "@/app/lib/share-link";

// Join-link block for call waiting screens: the URL is always VISIBLE and
// tappable, with share-sheet, WhatsApp, and copy paths that work in both
// Safari and the iOS app shell.

interface ShareJoinLinkProps {
  url: string;
  message?: string;
}

export default function ShareJoinLink({
  url,
  message = "Join my Entrevoz call:",
}: ShareJoinLinkProps) {
  const [feedback, setFeedback] = useState("");

  const flash = (text: string) => {
    setFeedback(text);
    setTimeout(() => setFeedback(""), 2500);
  };

  const handleShare = async () => {
    const result: ShareResult = await shareJoinLink(url, message);
    if (result === "copied") flash("✓ Link copied");
    if (result === "failed") flash("Long-press the link above to copy");
  };

  const handleCopy = async () => {
    flash((await copyText(url)) ? "✓ Link copied" : "Long-press the link above to copy");
  };

  return (
    <div className="mt-3 space-y-3">
      <a
        href={url}
        onClick={(e) => e.preventDefault()}
        className="block text-cyan-300 text-xs font-mono break-all select-all underline decoration-cyan-300/40 px-2"
      >
        {url}
      </a>

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={handleShare}
          className="px-4 py-2 bg-[#00C896] text-black text-sm font-bold rounded-lg min-h-[44px] whitespace-nowrap active:scale-95 transition-transform"
        >
          🔗 Share Link
        </button>
        <a
          href={whatsappShareUrl(url, message)}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-[#25D366]/20 text-[#25D366] text-sm font-bold rounded-lg min-h-[44px] whitespace-nowrap flex items-center active:scale-95 transition-transform"
        >
          WhatsApp
        </a>
        <button
          onClick={handleCopy}
          className="px-4 py-2 bg-white/10 text-white/70 text-sm rounded-lg min-h-[44px] whitespace-nowrap active:scale-95 transition-transform"
        >
          Copy
        </button>
      </div>

      {feedback && (
        <p className="text-[#00C896] text-xs" role="status" aria-live="polite">
          {feedback}
        </p>
      )}
    </div>
  );
}
