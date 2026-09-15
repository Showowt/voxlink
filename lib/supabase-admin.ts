// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE ADMIN (service role) — server-only writes that bypass RLS/grants.
// Use for tables that deny anon direct access (e.g. push_tokens). NEVER import
// in client components.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient | null {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
