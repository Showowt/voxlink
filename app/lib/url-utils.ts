/**
 * URL Utilities for VoxLink
 * Handles URL cleaning, validation, and sharing for universal compatibility
 */

// Tracking parameters added by social media and ad platforms
const TRACKING_PARAMS = [
  // Facebook
  "fbclid",
  "fb_action_ids",
  "fb_action_types",
  "fb_source",
  // Google
  "gclid",
  "dclid",
  // UTM parameters
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  // Twitter
  "twclid",
  // Microsoft/Bing
  "msclkid",
  // Mailchimp
  "mc_cid",
  "mc_eid",
  // HubSpot
  "hsa_cam",
  "hsa_grp",
  "hsa_mt",
  "hsa_src",
  "hsa_ad",
  "hsa_acc",
  "hsa_net",
  "hsa_kw",
  // Generic
  "ref",
  "referrer",
  "_ga",
  "_gl",
];

/**
 * Remove tracking parameters from URL
 * @param url - Full URL or just query string
 * @returns Cleaned URL without tracking params
 */
export function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    TRACKING_PARAMS.forEach((param) => {
      parsed.searchParams.delete(param);
    });
    return parsed.toString();
  } catch {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Clean query params from current location (client-side)
 * Returns the pathname + cleaned search params
 */
export function getCleanedPath(): string {
  if (typeof window === "undefined") return "/";

  const { pathname, search } = window.location;
  if (!search) return pathname;

  try {
    const params = new URLSearchParams(search);
    TRACKING_PARAMS.forEach((param) => {
      params.delete(param);
    });
    const cleanSearch = params.toString();
    return cleanSearch ? `${pathname}?${cleanSearch}` : pathname;
  } catch {
    return pathname;
  }
}

/**
 * Validate room code format
 * Valid: 4-8 alphanumeric characters (uppercase)
 */
export function isValidRoomCode(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  // Allow 4-8 alphanumeric chars, case insensitive
  return /^[A-Za-z0-9]{4,8}$/.test(code);
}

/**
 * Normalize room code to uppercase
 */
export function normalizeRoomCode(code: string): string {
  return code.toUpperCase().trim();
}

/**
 * Generate a clean share URL for a room
 * @param roomCode - The room code
 * @param mode - 'call' for video, 'talk' for text
 * @param origin - Optional custom origin (defaults to current)
 */
export function getShareUrl(
  roomCode: string,
  mode: "call" | "talk",
  origin?: string,
): string {
  const base =
    origin ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "https://www.entrevoz.co");

  const normalizedCode = normalizeRoomCode(roomCode);
  return `${base}/${mode}/${normalizedCode}`;
}

/**
 * Parse room code from URL path
 * Handles both /call/ROOMCODE and /?join=call&id=ROOMCODE formats
 */
export function parseRoomCodeFromUrl(url: string): {
  roomCode: string | null;
  mode: "call" | "talk" | null;
} {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;

    // Check direct path: /call/ROOMCODE or /talk/ROOMCODE
    const pathMatch = pathname.match(/^\/(call|talk)\/([A-Za-z0-9]{4,8})$/);
    if (pathMatch) {
      return {
        mode: pathMatch[1] as "call" | "talk",
        roomCode: normalizeRoomCode(pathMatch[2]),
      };
    }

    // Check query format: /?join=call&id=ROOMCODE
    const join = parsed.searchParams.get("join");
    const id = parsed.searchParams.get("id");
    if (join && id && (join === "call" || join === "talk")) {
      return {
        mode: join,
        roomCode: normalizeRoomCode(id),
      };
    }

    return { roomCode: null, mode: null };
  } catch {
    return { roomCode: null, mode: null };
  }
}

/**
 * Check if URL has tracking parameters
 */
export function hasTrackingParams(url: string): boolean {
  try {
    const parsed = new URL(url);
    return TRACKING_PARAMS.some((param) => parsed.searchParams.has(param));
  } catch {
    return false;
  }
}

/**
 * Extract host query param and validate
 */
export function parseHostParam(value: string | null): boolean {
  if (!value) return false;
  return value.toLowerCase() === "true";
}

/**
 * Extract and validate language param
 */
export function parseLanguageParam(value: string | null): string {
  const validLangs = [
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "zh",
    "ja",
    "ko",
    "ar",
    "ru",
    "hi",
  ];
  if (!value) return "en";
  const normalized = value.toLowerCase().substring(0, 2);
  return validLangs.includes(normalized) ? normalized : "en";
}
