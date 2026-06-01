import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-auth";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          return NextResponse.redirect(`${origin}${next}`);
        }
        return NextResponse.redirect(`${origin}/auth?error=session_missing`);
      }

      return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent(error.message)}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=oauth_failed`);
}
