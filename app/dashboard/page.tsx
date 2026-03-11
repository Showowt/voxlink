"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAnalytics } from "@/hooks/useAnalytics";

const MODES = [
  {
    id: "wingman",
    href: "/wingman",
    icon: "🎯",
    label: "Wingman",
    desc: "AI coaching in your ear",
    pro: true,
  },
  {
    id: "video",
    href: "/call",
    icon: "📹",
    label: "Video Call",
    desc: "Live translated video calls",
    pro: true,
  },
  {
    id: "face",
    href: "/face-to-face",
    icon: "🤝",
    label: "Face-to-Face",
    desc: "Split-screen in-person",
    pro: false,
  },
  {
    id: "proximity",
    href: "/proximity",
    icon: "📡",
    label: "Proximity",
    desc: "Radar discovery nearby",
    pro: true,
  },
  {
    id: "voxtype",
    href: "/",
    icon: "✍️",
    label: "VoxType",
    desc: "Type & verify translation",
    pro: false,
  },
  {
    id: "voxnote",
    href: "/",
    icon: "🎤",
    label: "VoxNote",
    desc: "Voice message translation",
    pro: false,
  },
];

function StreakRing({ streak }: { streak: number }) {
  const size = 80;
  const r = 32;
  const circ = 2 * Math.PI * r;
  const fill = Math.min(streak / 7, 1);

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#00E5A0"
          strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - fill)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-xl font-black text-white">{streak}</div>
        <div className="text-[9px] text-white/40 uppercase tracking-widest -mt-0.5">
          days
        </div>
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
  unit = "",
}: {
  label: string;
  used: number;
  limit: number;
  unit?: string;
}) {
  const pct = limit > 1000 ? 0 : Math.min(used / limit, 1);
  const isMax = limit > 1000;
  const isFull = !isMax && pct >= 1;

  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-white/50 text-xs">{label}</span>
        <span
          className={`text-xs font-semibold ${isFull ? "text-red-400" : isMax ? "text-[#00E5A0]" : "text-white/40"}`}
        >
          {isMax ? "∞" : `${used}${unit} / ${limit}${unit}`}
        </span>
      </div>
      {!isMax && (
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isFull ? "bg-red-400" : "bg-[#00E5A0]"}`}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const {
    profile,
    limits,
    isPro,
    isTrialing,
    trialDaysLeft,
    signOut,
    loading,
  } = useAuth();
  const { streak } = useAnalytics();
  const router = useRouter();
  const params = useSearchParams();

  const [showUpgradeToast, setShowUpgradeToast] = useState(false);

  useEffect(() => {
    if (params.get("upgraded") === "true") {
      setShowUpgradeToast(true);
      setTimeout(() => setShowUpgradeToast(false), 5000);
    }
  }, [params]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030507] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00E5A0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const planLabel = isPro
    ? "Pro"
    : isTrialing
      ? `Trial (${trialDaysLeft}d left)`
      : "Free";
  const planColor = isPro
    ? "text-[#00E5A0]"
    : isTrialing
      ? "text-yellow-400"
      : "text-white/40";

  return (
    <div className="min-h-screen bg-[#030507] text-white">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[400px] rounded-full bg-[#00E5A0]/3 blur-[120px]" />
      </div>

      {showUpgradeToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#00E5A0] text-black font-bold px-5 py-3 rounded-full text-sm shadow-lg animate-bounce">
          🎉 Welcome to Pro! All limits unlocked.
        </div>
      )}

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 safe-top safe-bottom">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-black">
              {profile?.display_name
                ? `Hey, ${profile.display_name.split(" ")[0]}`
                : "Dashboard"}
            </h1>
            <span className={`text-sm font-semibold ${planColor}`}>
              {planLabel}
            </span>
          </div>
          <button
            onClick={signOut}
            className="text-white/25 text-sm hover:text-white/50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            Sign out
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="col-span-1 bg-white/[0.04] border border-white/8 rounded-2xl p-4 flex flex-col items-center justify-center gap-2">
            <StreakRing streak={streak?.current_streak ?? 0} />
            <div className="text-xs text-white/40 text-center">Day streak</div>
          </div>

          <div className="col-span-2 bg-white/[0.04] border border-white/8 rounded-2xl p-4 grid grid-cols-2 gap-4">
            {[
              { label: "Total sessions", value: streak?.total_sessions ?? 0 },
              { label: "Total minutes", value: streak?.total_minutes ?? 0 },
              {
                label: "Best streak",
                value: streak?.longest_streak ?? 0,
                suffix: "d",
              },
              { label: "Plan", value: planLabel, isText: true },
            ].map(({ label, value, suffix = "", isText }) => (
              <div key={label}>
                <div
                  className={`font-black ${isText ? "text-base" : "text-2xl"} ${isText ? planColor : "text-white"}`}
                >
                  {isText ? value : `${value}${suffix}`}
                </div>
                <div className="text-xs text-white/30 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {!isPro && (
          <div className="bg-white/[0.04] border border-white/8 rounded-2xl p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-white/60">
                Today&apos;s usage
              </span>
              <span className="text-xs text-white/25">Resets at midnight</span>
            </div>
            <div className="flex flex-col gap-3">
              <UsageBar
                label="Wingman sessions"
                used={limits?.today_wingman_sessions ?? 0}
                limit={limits?.wingman_limit ?? 10}
              />
              <UsageBar
                label="Video minutes"
                used={limits?.today_video_minutes ?? 0}
                limit={limits?.video_minute_limit ?? 5}
                unit="m"
              />
            </div>

            <button
              onClick={() => router.push("/pricing")}
              className="w-full mt-4 bg-[#00E5A0] text-black font-bold py-3 rounded-xl text-sm hover:bg-[#00E5A0]/90 active:scale-95 transition-all min-h-[48px]"
            >
              Upgrade to Pro — Unlimited everything
            </button>
          </div>
        )}

        {isTrialing && (
          <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-2xl p-4 mb-6 flex items-center justify-between">
            <div>
              <div className="text-yellow-400 font-bold text-sm">
                {trialDaysLeft} days left in your trial
              </div>
              <div className="text-white/40 text-xs mt-0.5">
                Upgrade now to keep Pro access
              </div>
            </div>
            <button
              onClick={() => router.push("/pricing")}
              className="bg-yellow-400 text-black font-bold px-4 py-2 rounded-xl text-xs whitespace-nowrap min-h-[44px]"
            >
              Upgrade →
            </button>
          </div>
        )}

        <h2 className="text-white/40 text-xs uppercase tracking-widest mb-3">
          Your modes
        </h2>
        <div className="grid grid-cols-2 gap-3 mb-8">
          {MODES.map((mode) => {
            const locked = mode.pro && !isPro && !isTrialing;
            return (
              <button
                key={mode.id}
                onClick={() =>
                  locked ? router.push("/pricing") : router.push(mode.href)
                }
                className={[
                  "relative text-left bg-white/[0.04] border rounded-2xl p-4 transition-all active:scale-95 min-h-[100px]",
                  locked
                    ? "border-white/5 opacity-50"
                    : "border-white/8 hover:border-white/15",
                ].join(" ")}
              >
                {locked && (
                  <div className="absolute top-3 right-3 bg-white/10 rounded-full w-5 h-5 flex items-center justify-center">
                    <span className="text-[10px]">🔒</span>
                  </div>
                )}
                <div className="text-2xl mb-2">{mode.icon}</div>
                <div className="text-sm font-bold text-white">{mode.label}</div>
                <div className="text-xs text-white/35 mt-0.5">{mode.desc}</div>
              </button>
            );
          })}
        </div>

        {isPro && (
          <div className="text-center">
            <button
              onClick={async () => {
                const res = await fetch("/api/stripe/portal", {
                  method: "POST",
                });
                const { url } = await res.json();
                if (url) window.location.href = url;
              }}
              className="text-white/25 text-sm hover:text-white/50 transition-colors min-h-[44px]"
            >
              Manage subscription →
            </button>
          </div>
        )}

        <div className="text-center mt-8">
          <a
            href="/"
            className="text-white/25 text-sm hover:text-white/50 transition-colors"
          >
            ← Back to Voxxo
          </a>
        </div>
      </div>
    </div>
  );
}
