"use client";

import { type FC } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// VOXXO LOGO - Animated brand logo with gradient and glow
// Features: gradient container, glow effects, optional animation
// ═══════════════════════════════════════════════════════════════════════════════

interface VoxxoLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  animate?: boolean;
  showBrand?: boolean;
  className?: string;
}

const VoxxoLogo: FC<VoxxoLogoProps> = ({
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
      {/* Logo Container */}
      <div
        className={`
          ${config.container}
          inline-flex items-center justify-center
          bg-gradient-to-br from-voxxo-400 to-accent-DEFAULT
          shadow-2xl shadow-voxxo-500/30
          ring-2 ring-white/20
          ${animateClass}
        `}
      >
        <span className={config.icon}>🔗</span>
      </div>

      {showBrand && (
        <div className="mt-3 text-center">
          {/* MachineMind Tag */}
          <div className="flex items-center justify-center gap-1 mb-1">
            <span
              className={`${config.subtitle} font-medium text-voxxo-500 tracking-[0.15em] uppercase`}
            >
              MachineMind
            </span>
          </div>

          {/* Voxxo Title */}
          <h1
            className={`${config.title} font-bold font-syne tracking-tight text-gradient-premium`}
          >
            Voxxo
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

export default VoxxoLogo;
export { VoxxoLogo };
