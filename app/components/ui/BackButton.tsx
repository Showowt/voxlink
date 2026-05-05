"use client";

import { useRouter } from "next/navigation";

interface BackButtonProps {
  href?: string;
  label?: string;
  className?: string;
}

export function BackButton({ href, label, className = "" }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => (href ? router.push(href) : router.back())}
      className={`group flex items-center gap-1.5 px-3 py-2 min-h-[44px] min-w-[44px] rounded-xl text-white/60 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all duration-200 ${className}`}
      aria-label={label || "Go back"}
    >
      <svg
        className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          d="M15 19l-7-7 7-7"
        />
      </svg>
      {label && (
        <span className="text-sm font-medium">{label}</span>
      )}
    </button>
  );
}
