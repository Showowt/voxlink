"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface DashboardData {
  translations: { total: number; today: number; trend: number };
  calls: { total: number; today: number };
  users: { total: number; active7d: number; active30d: number };
  languages: { total: number; topPairs: { pair: string; count: number }[] };
  daily: { date: string; translations: number; calls: number }[];
  quality: { avgLatency: number; matchRate: number; providers: { name: string; count: number }[] };
  platforms: { web: number; ios: number; android: number };
  features: { name: string; count: number }[];
}

type DateRange = "today" | "7d" | "30d" | "all";

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push("/")}
      className="flex items-center gap-1.5 text-white/50 hover:text-white transition-colors text-sm"
      aria-label="Back to home"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}

function MetricCard({
  label,
  value,
  subValue,
  trend,
  icon,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: number;
  icon: string;
}) {
  return (
    <div className="bg-[#12121a] border border-white/[0.06] rounded-xl p-4 sm:p-5 hover:border-white/[0.12] transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-white/50">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {subValue && (
          <span className="text-xs text-white/40">{subValue}</span>
        )}
        {trend !== undefined && trend !== 0 && (
          <span
            className={`text-xs font-medium ${
              trend > 0 ? "text-[#00C896]" : "text-[#ef4444]"
            }`}
          >
            {trend > 0 ? "+" : ""}
            {trend}% vs yesterday
          </span>
        )}
      </div>
    </div>
  );
}

function BarChart({
  data,
  maxValue,
}: {
  data: { label: string; value: number; secondary?: number }[];
  maxValue: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-white/30 text-sm">
        No data available
      </div>
    );
  }

  const safeMax = maxValue || 1;

  return (
    <div className="flex items-end gap-[3px] h-44 overflow-x-auto pb-6 relative">
      {data.map((item, i) => (
        <div key={i} className="flex-1 min-w-[14px] flex flex-col items-center relative group">
          {/* Tooltip */}
          <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-[#1a1a2e] border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white/70 whitespace-nowrap">
            {item.label}: {item.value.toLocaleString()}
            {item.secondary !== undefined && ` | ${item.secondary} calls`}
          </div>
          {/* Bar */}
          <div
            className="w-full rounded-t-sm transition-all duration-300"
            style={{
              height: `${Math.max((item.value / safeMax) * 100, 2)}%`,
              background: "linear-gradient(to top, #0066FF, #00C896)",
              opacity: item.value === 0 ? 0.15 : 1,
            }}
          />
          {/* Date label - show every 3rd */}
          {(i % 3 === 0 || i === data.length - 1) && (
            <span className="absolute -bottom-5 text-[9px] text-white/30 whitespace-nowrap">
              {item.label.slice(5)} {/* MM-DD */}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function HorizontalBar({
  items,
  colorFrom,
  colorTo,
}: {
  items: { label: string; value: number }[];
  colorFrom: string;
  colorTo: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-white/30 text-sm">
        No data available
      </div>
    );
  }

  const maxVal = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-white/50 w-16 sm:w-20 truncate text-right shrink-0">
            {item.label}
          </span>
          <div className="flex-1 bg-white/[0.04] rounded-full h-5 overflow-hidden relative">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max((item.value / maxVal) * 100, 3)}%`,
                background: `linear-gradient(to right, ${colorFrom}, ${colorTo})`,
              }}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/60 font-mono">
              {item.value.toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#12121a] border border-white/[0.06] rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-medium text-white/60 mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRETTY NAMES
// ═══════════════════════════════════════════════════════════════════════════════

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese",
  de: "German", it: "Italian", zh: "Chinese", ja: "Japanese",
  ko: "Korean", ar: "Arabic", ru: "Russian", hi: "Hindi",
  nl: "Dutch", pl: "Polish", tr: "Turkish", vi: "Vietnamese",
  th: "Thai", id: "Indonesian", uk: "Ukrainian", el: "Greek",
};

function prettyLangPair(pair: string): string {
  const [from, to] = pair.split("-");
  const fromName = LANG_NAMES[from] || from?.toUpperCase();
  const toName = LANG_NAMES[to] || to?.toUpperCase();
  return `${fromName} > ${toName}`;
}

const EVENT_LABELS: Record<string, string> = {
  translation_request: "Translate",
  wingman_session_start: "Wingman",
  video_call_start: "Video Call",
  video_call_end: "Call End",
  face_to_face_start: "Face-to-Face",
  proximity_scan: "Proximity",
  proximity_connected: "Prox Connect",
  paywall_seen: "Paywall View",
  paywall_clicked: "Paywall Click",
  signup_started: "Signup Start",
  signup_completed: "Signup Done",
  share_app: "Share",
  wingman_session_end: "Wingman End",
  wingman_suggestion_selected: "Wingman Pick",
  onboarding_step: "Onboarding",
  video_minute_used: "Video Min",
  subscription_started: "Subscribed",
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function AnalyticsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>("30d");
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchData = useCallback(async (selectedRange: DateRange) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/dashboard?range=${selectedRange}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setLastFetched(new Date());
    } catch (err) {
      console.error("[Analytics] Fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(range);
  }, [range, fetchData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchData(range), 60000);
    return () => clearInterval(interval);
  }, [range, fetchData]);

  const ranges: { id: DateRange; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "7d", label: "7 Days" },
    { id: "30d", label: "30 Days" },
    { id: "all", label: "All Time" },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#060810] text-white safe-top safe-bottom">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#060810]/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BackButton />
              <div className="w-px h-5 bg-white/10" />
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Entrevoz Analytics
              </h1>
            </div>

            {/* Date Range Selector */}
            <div className="flex gap-1 sm:gap-1.5 bg-white/[0.04] rounded-lg p-0.5 sm:p-1">
              {ranges.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setRange(r.id)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    range === r.id
                      ? "bg-white/[0.12] text-white"
                      : "text-white/40 hover:text-white/60"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 sm:py-6 space-y-5 sm:space-y-6">
        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-center">
            <p className="text-red-400 font-medium">{error}</p>
            <button
              onClick={() => fetchData(range)}
              className="mt-3 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 text-sm transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading overlay for refetch */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="relative w-12 h-12 mx-auto mb-3">
                <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                <div
                  className="absolute inset-0 rounded-full border-2 border-transparent animate-spin"
                  style={{
                    borderTopColor: "#00C896",
                    borderRightColor: "rgba(0, 200, 150, 0.4)",
                    animationDuration: "1s",
                  }}
                />
              </div>
              <p className="text-white/40 text-sm">Loading analytics...</p>
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Row 1 — Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <MetricCard
                label="Total Translations"
                value={data.translations.total}
                subValue={`${data.translations.today.toLocaleString()} today`}
                trend={data.translations.trend}
                icon="🌐"
              />
              <MetricCard
                label="Total Calls"
                value={data.calls.total}
                subValue={`${data.calls.today} today`}
                icon="📹"
              />
              <MetricCard
                label="Active Users"
                value={data.users.active30d}
                subValue={`${data.users.active7d} this week`}
                icon="👤"
              />
              <MetricCard
                label="Languages Used"
                value={data.languages.total}
                subValue={`${data.languages.topPairs.length} pairs`}
                icon="🗣️"
              />
            </div>

            {/* Row 2 — Translation Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Translations Per Day (30d)">
                <BarChart
                  data={data.daily.map((d) => ({
                    label: d.date,
                    value: d.translations,
                    secondary: d.calls,
                  }))}
                  maxValue={Math.max(...data.daily.map((d) => d.translations), 1)}
                />
              </SectionCard>
              <SectionCard title="Top Language Pairs">
                <HorizontalBar
                  items={data.languages.topPairs.map((p) => ({
                    label: prettyLangPair(p.pair),
                    value: p.count,
                  }))}
                  colorFrom="#00C896"
                  colorTo="#0066FF"
                />
              </SectionCard>
            </div>

            {/* Row 3 — Platform & Features */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SectionCard title="Platform Breakdown">
                {(() => {
                  const total = data.platforms.web + data.platforms.ios + data.platforms.android;
                  if (total === 0) {
                    return (
                      <div className="flex items-center justify-center h-32 text-white/30 text-sm">
                        No platform data available
                      </div>
                    );
                  }
                  const platforms = [
                    { label: "Web", value: data.platforms.web, color: "#00C896" },
                    { label: "iOS", value: data.platforms.ios, color: "#0066FF" },
                    { label: "Android", value: data.platforms.android, color: "#8B5CF6" },
                  ].filter((p) => p.value > 0);

                  return (
                    <div className="space-y-4">
                      {/* Stacked bar */}
                      <div className="h-8 rounded-lg overflow-hidden flex">
                        {platforms.map((p) => (
                          <div
                            key={p.label}
                            className="h-full transition-all duration-500"
                            style={{
                              width: `${(p.value / total) * 100}%`,
                              backgroundColor: p.color,
                              minWidth: p.value > 0 ? "20px" : "0",
                            }}
                          />
                        ))}
                      </div>
                      {/* Legend */}
                      <div className="flex gap-4 flex-wrap">
                        {platforms.map((p) => (
                          <div key={p.label} className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                            <span className="text-xs text-white/60">
                              {p.label}: {p.value.toLocaleString()} ({Math.round((p.value / total) * 100)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </SectionCard>
              <SectionCard title="Feature Usage">
                <HorizontalBar
                  items={data.features.map((f) => ({
                    label: EVENT_LABELS[f.name] || f.name.replace(/_/g, " ").slice(0, 14),
                    value: f.count,
                  }))}
                  colorFrom="#8B5CF6"
                  colorTo="#EC4899"
                />
              </SectionCard>
            </div>

            {/* Row 4 — Quality Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SectionCard title="Avg Latency">
                <div className="text-center py-3">
                  <div className="text-3xl font-bold text-white">
                    {data.quality.avgLatency > 0 ? `${data.quality.avgLatency}` : "--"}
                    <span className="text-lg text-white/40 font-normal ml-1">ms</span>
                  </div>
                  <p className="text-xs text-white/40 mt-1">
                    {data.quality.avgLatency > 0 && data.quality.avgLatency < 300
                      ? "Excellent"
                      : data.quality.avgLatency < 500
                        ? "Good"
                        : data.quality.avgLatency > 0
                          ? "Needs improvement"
                          : "No data"}
                  </p>
                  {data.quality.avgLatency > 0 && (
                    <div className="mt-3 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.max(5, 100 - (data.quality.avgLatency / 10)))}%`,
                          background:
                            data.quality.avgLatency < 300
                              ? "#00C896"
                              : data.quality.avgLatency < 500
                                ? "#EAB308"
                                : "#ef4444",
                        }}
                      />
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Back-Translation Match">
                <div className="text-center py-3">
                  <div className="text-3xl font-bold text-white">
                    {data.quality.matchRate > 0 ? `${data.quality.matchRate}` : "--"}
                    <span className="text-lg text-white/40 font-normal ml-1">%</span>
                  </div>
                  <p className="text-xs text-white/40 mt-1">
                    {data.quality.matchRate >= 80
                      ? "High accuracy"
                      : data.quality.matchRate > 0
                        ? "Moderate accuracy"
                        : "No data"}
                  </p>
                  {data.quality.matchRate > 0 && (
                    <div className="mt-3 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${data.quality.matchRate}%`,
                          background: data.quality.matchRate >= 80 ? "#00C896" : "#EAB308",
                        }}
                      />
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Translation Providers">
                <div className="space-y-2">
                  {data.quality.providers.length === 0 ? (
                    <div className="flex items-center justify-center h-20 text-white/30 text-sm">
                      No data
                    </div>
                  ) : (
                    data.quality.providers.map((p) => {
                      const totalProviders = data.quality.providers.reduce((s, x) => s + x.count, 0);
                      const pct = totalProviders > 0 ? Math.round((p.count / totalProviders) * 100) : 0;
                      return (
                        <div key={p.name} className="flex items-center justify-between text-xs">
                          <span className="text-white/60 capitalize">{p.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[#00C896]"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-white/40 font-mono w-10 text-right">{pct}%</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </SectionCard>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-white/30 pb-4">
              {lastFetched && (
                <span>Last updated: {lastFetched.toLocaleTimeString()}</span>
              )}
              <span className="mx-2">|</span>
              <span>Auto-refreshes every 60s</span>
              <span className="mx-2">|</span>
              <button
                onClick={() => fetchData(range)}
                className="text-white/40 hover:text-white/60 transition-colors"
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh now"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
