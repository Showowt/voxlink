// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE BROWSER CLIENT - For Client Components ('use client')
// This file is safe to import in client components
// ═══════════════════════════════════════════════════════════════════════════════

import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createSupabaseBrowserClient> | null = null;

export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[Supabase Auth] Not configured - auth disabled. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable.",
    );
    return null;
  }

  // Singleton pattern - reuse browser client
  if (browserClient) {
    return browserClient;
  }

  browserClient = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
