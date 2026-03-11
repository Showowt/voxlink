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

// Export as getter for lazy initialization (prevents build-time errors)
// Returns a proxy that no-ops if Supabase isn't configured
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: keyof SupabaseClient) {
    const client = getSupabaseClient();
    if (!client) {
      // Return no-op functions for missing Supabase
      return () => ({
        insert: () => Promise.resolve({ data: null, error: null }),
        select: () => Promise.resolve({ data: [], error: null }),
        update: () => Promise.resolve({ data: null, error: null }),
        delete: () => Promise.resolve({ data: null, error: null }),
        upsert: () => Promise.resolve({ data: null, error: null }),
      });
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
