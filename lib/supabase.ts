// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT - Server-side database connection for API routes
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy-loaded singleton to prevent build-time errors
let _supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
    );
  }

  _supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return _supabase;
}

// Export as getter for lazy initialization (prevents build-time errors)
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: keyof SupabaseClient) {
    return getSupabaseClient()[prop];
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
