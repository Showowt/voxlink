import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Entrevoz Middleware
 * - CORS for API routes
 * - Strips tracking parameters from URLs
 */

const ALLOWED_ORIGINS = [
  "https://entrevoz.co",
  "https://www.entrevoz.co",
  "https://voxbridge-kappa.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

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
  const origin = request.headers.get("origin");

  // ─────────────────────────────────────────────────────────────────────────────
  // CORS for API routes
  // ─────────────────────────────────────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    // Preflight
    if (request.method === "OPTIONS") {
      const response = new NextResponse(null, { status: 200 });
      if (origin && ALLOWED_ORIGINS.includes(origin)) {
        response.headers.set("Access-Control-Allow-Origin", origin);
      }
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS",
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
      response.headers.set("Access-Control-Max-Age", "86400");
      return response;
    }

    // Actual request
    const response = NextResponse.next();
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    }
    return response;
  }

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
  matcher: ["/api/:path*", "/call/:path*", "/talk/:path*"],
};
