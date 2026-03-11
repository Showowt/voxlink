import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase-auth";

/**
 * VoxLink Middleware
 * - Handles Supabase Auth session refresh
 * - Protects authenticated routes
 * - Strips tracking parameters from URLs
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

// Routes that require authentication
const PROTECTED_ROUTES = [
  "/account",
  "/settings",
  "/api/stripe/create-checkout",
  "/api/stripe/portal",
  "/api/stripe/subscription",
];

// Routes that should skip auth middleware entirely
const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/terms",
  "/privacy",
  "/status",
  "/api/translate",
  "/api/auth",
  "/api/health",
  "/api/analytics",
];

// Tracking parameters to remove
const TRACKING_PARAMS = [
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "twclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "mc_cid",
  "mc_eid",
  "ref",
  "_ga",
  "_gl",
];

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Create response for potential modifications
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TRACKING PARAM CLEANUP (for call/talk routes)
  // ─────────────────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/call/") || pathname.startsWith("/talk/")) {
    let hasTrackingParams = false;
    const url = request.nextUrl.clone();

    for (const param of TRACKING_PARAMS) {
      if (searchParams.has(param)) {
        url.searchParams.delete(param);
        hasTrackingParams = true;
      }
    }

    if (hasTrackingParams) {
      return NextResponse.redirect(url);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTH SESSION REFRESH
  // Supabase requires this to keep sessions valid
  // ─────────────────────────────────────────────────────────────────────────────

  // Check if Supabase is configured before trying auth
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createMiddlewareClient(request, response);

      if (supabase) {
        // Refresh session if expired - this is required for Server Components
        const {
          data: { user },
        } = await supabase.auth.getUser();

        // ─────────────────────────────────────────────────────────────────────────
        // PROTECTED ROUTE CHECK
        // ─────────────────────────────────────────────────────────────────────────

        // Check if current path is protected
        const isProtectedRoute = PROTECTED_ROUTES.some(
          (route) => pathname === route || pathname.startsWith(`${route}/`),
        );

        if (isProtectedRoute && !user) {
          // Redirect to home with auth prompt
          const redirectUrl = new URL("/", request.url);
          redirectUrl.searchParams.set("auth_required", "true");
          redirectUrl.searchParams.set("redirect", pathname);

          return NextResponse.redirect(redirectUrl);
        }
      }
    } catch (error) {
      // Log but don't block - auth errors shouldn't break the app
      console.error("[Middleware] Auth error:", error);
    }
  }

  return response;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MATCHER CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (icons, manifest, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|robots.txt|sitemap.xml).*)",
  ],
};
