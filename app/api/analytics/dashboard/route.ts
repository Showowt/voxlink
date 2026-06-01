// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD API - Aggregated metrics for investor/internal dashboard
// GET /api/analytics/dashboard?range=7d|30d|today|all
// Uses SUPABASE_SERVICE_ROLE_KEY for server-side access
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Supabase Admin Client ───────────────────────────────────────────────────

function getAdminClient(): AnySupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Date Range Helper ───────────────────────────────────────────────────────

function getDateRange(range: string): { from: string | null; label: string } {
  const now = new Date();

  switch (range) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { from: start.toISOString(), label: "Today" };
    }
    case "7d": {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: start.toISOString(), label: "Last 7 Days" };
    }
    case "30d": {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { from: start.toISOString(), label: "Last 30 Days" };
    }
    case "all":
    default:
      return { from: null, label: "All Time" };
  }
}

// ─── Safe Query Helpers ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

async function safeCount(
  supabase: AnySupabaseClient,
  table: string,
  filters?: { column: string; value: string }[],
  dateFilter?: { column: string; from: string | null },
): Promise<number> {
  try {
    let query = supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (filters) {
      for (const f of filters) {
        query = query.eq(f.column, f.value);
      }
    }

    if (dateFilter?.from) {
      query = query.gte(dateFilter.column, dateFilter.from);
    }

    const { count, error } = await query;
    if (error) {
      console.error(`[Analytics] Count error on ${table}:`, error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err) {
    console.error(`[Analytics] Exception counting ${table}:`, err);
    return 0;
  }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured. Set SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "30d";
  const { from: dateFrom } = getDateRange(range);

  // Today boundaries
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  // Yesterday boundaries (for trend calculation)
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayISO = yesterdayStart.toISOString();

  try {
    // ── Parallel queries ──────────────────────────────────────────────────

    const [
      totalTranslations,
      todayTranslations,
      yesterdayTranslations,
      totalCalls,
      todayCalls,
      topPairsResult,
      dailyResult,
      qualityResult,
      providersResult,
      platformsResult,
      featuresResult,
      activeUsers7d,
      activeUsers30d,
      totalUsers,
    ] = await Promise.all([
      // 1. Total translations (in range)
      safeCount(supabase, "translation_analytics", undefined, dateFrom ? { column: "created_at", from: dateFrom } : undefined),

      // 2. Today's translations
      safeCount(supabase, "translation_analytics", undefined, { column: "created_at", from: todayISO }),

      // 3. Yesterday's translations (for trend)
      (async () => {
        try {
          const { count, error } = await supabase
            .from("translation_analytics")
            .select("*", { count: "exact", head: true })
            .gte("created_at", yesterdayISO)
            .lt("created_at", todayISO);
          if (error) return 0;
          return count ?? 0;
        } catch {
          return 0;
        }
      })(),

      // 4. Total calls (in range)
      (async () => {
        try {
          let query = supabase
            .from("usage_events")
            .select("*", { count: "exact", head: true })
            .in("event_type", ["video_call_start", "face_to_face_start"]);

          if (dateFrom) {
            query = query.gte("created_at", dateFrom);
          }

          const { count, error } = await query;
          if (error) return 0;
          return count ?? 0;
        } catch {
          return 0;
        }
      })(),

      // 5. Today's calls
      (async () => {
        try {
          const { count, error } = await supabase
            .from("usage_events")
            .select("*", { count: "exact", head: true })
            .in("event_type", ["video_call_start", "face_to_face_start"])
            .gte("created_at", todayISO);
          if (error) return 0;
          return count ?? 0;
        } catch {
          return 0;
        }
      })(),

      // 6. Top language pairs
      (async () => {
        try {
          let query = supabase
            .from("translation_analytics")
            .select("lang_pair");

          if (dateFrom) {
            query = query.gte("created_at", dateFrom);
          }

          const { data, error } = await query;
          if (error || !data) return [];

          // Aggregate in JS since Supabase doesn't support GROUP BY easily
          const counts = new Map<string, number>();
          for (const row of data) {
            const pair = (row as { lang_pair: string }).lang_pair || "unknown";
            counts.set(pair, (counts.get(pair) || 0) + 1);
          }
          return Array.from(counts.entries())
            .map(([pair, count]) => ({ pair, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        } catch {
          return [];
        }
      })(),

      // 7. Daily translation counts (last 30 days)
      (async () => {
        try {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from("translation_analytics")
            .select("created_at")
            .gte("created_at", thirtyDaysAgo);

          if (error || !data) return [];

          // Group by date
          const dayCounts = new Map<string, { translations: number; calls: number }>();
          for (const row of data) {
            const date = (row as { created_at: string }).created_at?.slice(0, 10) || "";
            if (!date) continue;
            const existing = dayCounts.get(date) || { translations: 0, calls: 0 };
            existing.translations++;
            dayCounts.set(date, existing);
          }

          // Also fetch daily calls
          const { data: callData } = await supabase
            .from("usage_events")
            .select("created_at")
            .in("event_type", ["video_call_start", "face_to_face_start"])
            .gte("created_at", thirtyDaysAgo);

          if (callData) {
            for (const row of callData) {
              const date = (row as { created_at: string }).created_at?.slice(0, 10) || "";
              if (!date) continue;
              const existing = dayCounts.get(date) || { translations: 0, calls: 0 };
              existing.calls++;
              dayCounts.set(date, existing);
            }
          }

          return Array.from(dayCounts.entries())
            .map(([date, counts]) => ({ date, ...counts }))
            .sort((a, b) => a.date.localeCompare(b.date));
        } catch {
          return [];
        }
      })(),

      // 8. Quality metrics (avg latency, match rate)
      (async () => {
        try {
          let query = supabase
            .from("translation_analytics")
            .select("latency_ms, back_translation_match");

          if (dateFrom) {
            query = query.gte("created_at", dateFrom);
          }

          // Limit to recent 5000 for performance
          query = query.order("created_at", { ascending: false }).limit(5000);

          const { data, error } = await query;
          if (error || !data || data.length === 0) {
            return { avgLatency: 0, matchRate: 0 };
          }

          let totalLatency = 0;
          let latencyCount = 0;
          let matchCount = 0;
          let matchTotal = 0;

          for (const row of data) {
            const r = row as { latency_ms: number | null; back_translation_match: number | null };
            if (r.latency_ms && r.latency_ms > 0) {
              totalLatency += r.latency_ms;
              latencyCount++;
            }
            if (r.back_translation_match !== null && r.back_translation_match !== undefined) {
              matchCount += r.back_translation_match;
              matchTotal++;
            }
          }

          return {
            avgLatency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
            matchRate: matchTotal > 0 ? Math.round((matchCount / matchTotal) * 100) : 0,
          };
        } catch {
          return { avgLatency: 0, matchRate: 0 };
        }
      })(),

      // 9. Provider breakdown
      (async () => {
        try {
          let query = supabase
            .from("translation_analytics")
            .select("source_provider");

          if (dateFrom) {
            query = query.gte("created_at", dateFrom);
          }

          const { data, error } = await query;
          if (error || !data) return [];

          const counts = new Map<string, number>();
          for (const row of data) {
            const provider = (row as { source_provider: string }).source_provider || "unknown";
            counts.set(provider, (counts.get(provider) || 0) + 1);
          }

          return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        } catch {
          return [];
        }
      })(),

      // 10. Platform breakdown (from usage_events metadata)
      (async () => {
        try {
          let query = supabase
            .from("usage_events")
            .select("metadata");

          if (dateFrom) {
            query = query.gte("created_at", dateFrom);
          }

          query = query.limit(10000);
          const { data, error } = await query;
          if (error || !data) return { web: 0, ios: 0, android: 0 };

          let web = 0, ios = 0, android = 0;
          for (const row of data) {
            const meta = (row as { metadata: Record<string, unknown> | null }).metadata;
            const platform = (meta?.platform as string || "").toLowerCase();
            if (platform.includes("ios") || platform.includes("iphone") || platform.includes("ipad")) {
              ios++;
            } else if (platform.includes("android")) {
              android++;
            } else {
              web++;
            }
          }

          return { web, ios, android };
        } catch {
          return { web: 0, ios: 0, android: 0 };
        }
      })(),

      // 11. Feature usage breakdown
      (async () => {
        try {
          let query = supabase
            .from("usage_events")
            .select("event_type");

          if (dateFrom) {
            query = query.gte("created_at", dateFrom);
          }

          const { data, error } = await query;
          if (error || !data) return [];

          const counts = new Map<string, number>();
          for (const row of data) {
            const event = (row as { event_type: string }).event_type || "unknown";
            counts.set(event, (counts.get(event) || 0) + 1);
          }

          return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 12);
        } catch {
          return [];
        }
      })(),

      // 12. Active users last 7 days (unique session_ids from usage_events)
      (async () => {
        try {
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from("usage_events")
            .select("session_id")
            .gte("created_at", sevenDaysAgo);

          if (error || !data) return 0;
          const unique = new Set(data.map((r: { session_id: string }) => r.session_id).filter(Boolean));
          return unique.size;
        } catch {
          return 0;
        }
      })(),

      // 13. Active users last 30 days
      (async () => {
        try {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const { data, error } = await supabase
            .from("usage_events")
            .select("session_id")
            .gte("created_at", thirtyDaysAgo);

          if (error || !data) return 0;
          const unique = new Set(data.map((r: { session_id: string }) => r.session_id).filter(Boolean));
          return unique.size;
        } catch {
          return 0;
        }
      })(),

      // 14. Total unique users (all time)
      (async () => {
        try {
          const { data, error } = await supabase
            .from("usage_events")
            .select("session_id");

          if (error || !data) return 0;
          const unique = new Set(data.map((r: { session_id: string }) => r.session_id).filter(Boolean));
          return unique.size;
        } catch {
          return 0;
        }
      })(),
    ]);

    // ── Trend calculation ─────────────────────────────────────────────────

    const trend = yesterdayTranslations > 0
      ? Math.round(((todayTranslations - yesterdayTranslations) / yesterdayTranslations) * 100)
      : todayTranslations > 0 ? 100 : 0;

    // ── Distinct languages count ──────────────────────────────────────────

    const distinctLangs = new Set<string>();
    for (const { pair } of topPairsResult) {
      const parts = pair.split("-");
      for (const p of parts) {
        if (p && p !== "unknown") distinctLangs.add(p);
      }
    }

    // ── Assemble response ─────────────────────────────────────────────────

    const dashboard: DashboardData = {
      translations: {
        total: totalTranslations,
        today: todayTranslations,
        trend,
      },
      calls: {
        total: totalCalls,
        today: todayCalls,
      },
      users: {
        total: totalUsers,
        active7d: activeUsers7d,
        active30d: activeUsers30d,
      },
      languages: {
        total: distinctLangs.size,
        topPairs: topPairsResult,
      },
      daily: dailyResult,
      quality: {
        avgLatency: qualityResult.avgLatency,
        matchRate: qualityResult.matchRate,
        providers: providersResult,
      },
      platforms: platformsResult,
      features: featuresResult,
    };

    return NextResponse.json(dashboard, {
      headers: {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("[Analytics Dashboard] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
