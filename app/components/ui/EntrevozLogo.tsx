"use client";

import { type FC } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// ENTREVOZ LOGO - Animated brand logo with teal/pink gradient
// Features: gradient container, glow effects, optional animation
// Brand: Teal #00DBA8, Pink #FF3B7A, Dark #0D0D0D
// ═══════════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// BubbleMark — the canonical two-bubble Entrevoz mark (green + pink), tails
// splayed outward. Matches native/assets/entrevoz-mark.svg and the App Store
// icon exactly. currentColor is unused; colors are baked to stay on-brand.
// ───────────────────────────────────────────────────────────────────────────
export const BubbleMark: FC<{ className?: string; title?: string }> = ({
  className = "",
  title = "Entrevoz",
}) => (
  <svg
    viewBox="0 0 214 118"
    className={className}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label={title}
  >
    <g fill="#00DBA8">
      <rect x="0" y="0" width="100" height="79" rx="22" ry="22" />
      <path d="M17 75 L46 75 L6 114 Z" />
    </g>
    <g fill="#FF3B7A">
      <rect x="114" y="0" width="100" height="79" rx="22" ry="22" />
      <path d="M197 75 L168 75 L208 114 Z" />
    </g>
  </svg>
);

interface EntrevozLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  animate?: boolean;
  showBrand?: boolean;
  className?: string;
}

const EntrevozLogo: FC<EntrevozLogoProps> = ({
  size = "md",
  animate = false,
  showBrand = true,
  className = "",
}) => {
  // Size configurations
  const sizes = {
    sm: {
      container: "w-10 h-10 rounded-xl",
      icon: "text-xl",
      title: "text-lg",
      subtitle: "text-[10px]",
    },
    md: {
      container: "w-14 h-14 rounded-2xl",
      icon: "text-2xl",
      title: "text-2xl",
      subtitle: "text-xs",
    },
    lg: {
      container: "w-18 h-18 rounded-2xl",
      icon: "text-3xl",
      title: "text-3xl",
      subtitle: "text-sm",
    },
    xl: {
      container: "w-24 h-24 rounded-3xl",
      icon: "text-5xl",
      title: "text-4xl",
      subtitle: "text-base",
    },
  };

  const config = sizes[size];
  const animateClass = animate ? "animate-glow-pulse" : "";

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Logo Container — two-bubble mark on the signature dark tile */}
      <div
        className={`
          ${config.container}
          inline-flex items-center justify-center
          bg-[#0D0D0D]
          shadow-2xl shadow-[#00DBA8]/25
          ring-1 ring-white/10
          ${animateClass}
        `}
      >
        <BubbleMark className="w-[62%] h-auto" />
      </div>

      {showBrand && (
        <div className="mt-3 text-center">
          {/* MachineMind Tag */}
          <div className="flex items-center justify-center gap-1 mb-1">
            <span
              className={`${config.subtitle} font-medium text-[#00DBA8] tracking-[0.15em] uppercase`}
            >
              MachineMind
            </span>
          </div>

          {/* Entrevoz Title - Gradient text */}
          <h1
            className={`${config.title} font-bold font-syne tracking-tight bg-gradient-to-r from-[#00DBA8] to-[#FF3B7A] bg-clip-text text-transparent`}
          >
            Entrevoz
          </h1>

          {/* Tagline */}
          <p className="text-white/70 text-sm mt-1">
            Your Voice. Any Language. Instantly.
          </p>
        </div>
      )}
    </div>
  );
};

// Export both for backward compatibility
export default EntrevozLogo;
export { EntrevozLogo };

// Alias for old imports
export const VoxxoLogo = EntrevozLogo;
