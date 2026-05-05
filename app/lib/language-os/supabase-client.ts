import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.warn("[Language OS] Missing Supabase env vars — using localStorage only");
}

export const losClient: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function safeSupabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: unknown }>,
  fallback: T,
): Promise<T> {
  if (!losClient) return fallback;
  try {
    const { data, error } = await queryFn();
    if (error) {
      console.error("[Language OS] Supabase error:", error);
      return fallback;
    }
    return data ?? fallback;
  } catch (e) {
    console.error("[Language OS] Supabase unreachable:", e);
    return fallback;
  }
}
