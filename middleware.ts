import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * VoxLink Middleware
 * - Strips tracking parameters from URLs
 * - Lightweight Edge-compatible middleware
 */

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

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Only match call and talk routes for tracking param cleanup
    "/call/:path*",
    "/talk/:path*",
  ],
};
