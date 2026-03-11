// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT - Server-side database connection for API routes
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy-loaded singleton to prevent build-time errors
let _supabase: SupabaseClient | null = null;
let _supabaseConfigured = false;

function getSupabaseClient(): SupabaseClient | null {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Don't throw - allow app to work without Supabase (analytics disabled)
    console.warn(
      "[Supabase] Not configured - analytics disabled. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable.",
    );
    return null;
  }

  _supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  _supabaseConfigured = true;

  return _supabase;
}

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  getSupabaseClient(); // Trigger initialization
  return _supabaseConfigured;
}

// No-op query builder for when Supabase isn't configured
const createNoOpQueryBuilder = () => {
  const noOpResult = Promise.resolve({ data: null, error: null });
  const noOpBuilder: Record<string, unknown> = {};

  // All Supabase query methods return the builder for chaining
  const chainableMethods = [
    "insert",
    "select",
    "update",
    "delete",
    "upsert",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "like",
    "ilike",
    "is",
    "in",
    "contains",
    "containedBy",
    "range",
    "overlaps",
    "textSearch",
    "match",
    "not",
    "or",
    "filter",
    "order",
    "limit",
    "single",
    "maybeSingle",
    "csv",
    "explain",
    "rollback",
    "returns",
  ];

  for (const method of chainableMethods) {
    noOpBuilder[method] = () => noOpBuilder;
  }

  // These methods return promises
  noOpBuilder.then = (
    resolve: (value: { data: null; error: null }) => void,
  ) => {
    resolve({ data: null, error: null });
    return noOpResult;
  };

  return noOpBuilder;
};

// Export as getter for lazy initialization (prevents build-time errors)
// Returns a proxy that no-ops if Supabase isn't configured
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: keyof SupabaseClient) {
    const client = getSupabaseClient();
    if (!client) {
      // Return no-op for 'from' that returns chainable query builder
      if (prop === "from") {
        return () => createNoOpQueryBuilder();
      }
      // Return no-op for other methods
      return () => Promise.resolve({ data: null, error: null });
    }
    return client[prop];
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProximityPresence {
  id: string;
  session_id: string;
  language: string;
  lat: number;
  lng: number;
  status: "available" | "busy" | "in_call";
  user_agent?: string;
  created_at: string;
  expires_at: string;
  last_heartbeat: string;
}

export interface ProximityRequest {
  id: string;
  from_session_id: string;
  to_session_id: string;
  message?: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  room_code?: string;
  created_at: string;
  responded_at?: string;
  expires_at: string;
}

export interface NearbyUser {
  id: string;
  session_id: string;
  language: string;
  distance: number;
  status: "available" | "busy" | "in_call";
}
