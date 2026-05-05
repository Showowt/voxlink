"use client";

/**
 * /cyrano — Standalone Cyrano Mode Practice Page
 *
 * Practice conversations with AI coaching without a video call.
 * Perfect for rehearsing interviews, dates, or difficult conversations.
 */

import { CyranoPage } from "../components/CyranoOverlay";
import { BackButton } from "../components/ui/BackButton";

export default function CyranoStandalonePage() {
  return (
    <div className="relative min-h-[100dvh]">
      <div className="absolute top-4 left-4 z-50">
        <BackButton href="/" label="Back" />
      </div>
      <CyranoPage />
    </div>
  );
}
