// ═══════════════════════════════════════════════════════════════════════════════
// AUTH CALLBACK API - OAuth and Email Confirmation Handler
// GET /api/auth/callback
// Handles redirects from OAuth providers (Google, Apple) and email confirmations
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-auth";

// ═══════════════════════════════════════════════════════════════════════════════
// GET - Handle OAuth redirect and email confirmation
// ═══════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorDescription = requestUrl.searchParams.get("error_description");
  const next = requestUrl.searchParams.get("next") || "/";

  // Handle OAuth errors
  if (error) {
    console.error("[Auth Callback] OAuth error:", error, errorDescription);

    // Redirect to home with error
    const errorUrl = new URL("/", requestUrl.origin);
    errorUrl.searchParams.set("auth_error", error);
    if (errorDescription) {
      errorUrl.searchParams.set("auth_error_description", errorDescription);
    }

    return NextResponse.redirect(errorUrl);
  }

  // No code means no authentication attempt
  if (!code) {
    console.warn("[Auth Callback] No code provided");
    return NextResponse.redirect(new URL("/", requestUrl.origin));
  }

  try {
    // Create Supabase client
    const supabase = await createServerClient();

    if (!supabase) {
      console.error("[Auth Callback] Supabase not configured");
      const errorUrl = new URL("/", requestUrl.origin);
      errorUrl.searchParams.set("auth_error", "configuration_error");
      return NextResponse.redirect(errorUrl);
    }

    // Exchange the code for a session
    const { data, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("[Auth Callback] Code exchange error:", exchangeError);

      const errorUrl = new URL("/", requestUrl.origin);
      errorUrl.searchParams.set("auth_error", "exchange_failed");
      errorUrl.searchParams.set(
        "auth_error_description",
        exchangeError.message,
      );

      return NextResponse.redirect(errorUrl);
    }

    if (!data.session) {
      console.error("[Auth Callback] No session returned");

      const errorUrl = new URL("/", requestUrl.origin);
      errorUrl.searchParams.set("auth_error", "no_session");

      return NextResponse.redirect(errorUrl);
    }

    // Successfully authenticated - redirect to the intended destination
    const successUrl = new URL(next, requestUrl.origin);

    // Add a success indicator
    successUrl.searchParams.set("auth_success", "true");

    return NextResponse.redirect(successUrl);
  } catch (err) {
    console.error("[Auth Callback] Unexpected error:", err);

    const errorUrl = new URL("/", requestUrl.origin);
    errorUrl.searchParams.set("auth_error", "unexpected_error");

    return NextResponse.redirect(errorUrl);
  }
}
