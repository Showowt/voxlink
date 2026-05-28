import type { Metadata } from "next";
import PricingContent from "./PricingContent";

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING PAGE - Server Component with Metadata
// ═══════════════════════════════════════════════════════════════════════════════

export const metadata: Metadata = {
  title: "Pricing — Entrevoz",
  description: "Choose your plan. Free forever or unlock unlimited power.",
  openGraph: {
    title: "Pricing — Entrevoz",
    description: "Choose your plan. Free forever or unlock unlimited power.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — Entrevoz",
    description: "Choose your plan. Free forever or unlock unlimited power.",
  },
};

export default function PricingPage() {
  return <PricingContent />;
}
