import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * VoxLink Middleware
 * - Strips tracking parameters from URLs (fbclid, utm_*, etc.)
 * - Redirects clean URLs for consistent linking
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

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const { pathname, searchParams } = url;

  // Only process call and talk routes
  if (!pathname.startsWith("/call/") && !pathname.startsWith("/talk/")) {
    return NextResponse.next();
  }

  // Check if URL has any tracking params
  let hasTrackingParams = false;
  for (const param of TRACKING_PARAMS) {
    if (searchParams.has(param)) {
      searchParams.delete(param);
      hasTrackingParams = true;
    }
  }

  // If tracking params were found, redirect to clean URL
  if (hasTrackingParams) {
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Only run on call and talk routes
export const config = {
  matcher: ["/call/:path*", "/talk/:path*"],
};
