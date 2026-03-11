// ═══════════════════════════════════════════════════════════════════════════════
// AUTH TOKENS - HMAC-signed session token generation and verification
// ═══════════════════════════════════════════════════════════════════════════════

import { randomBytes, timingSafeEqual, createHmac } from "crypto";

// Token format: timestamp:nonce:signature (signature verifies both)
// Expires after 30 days
const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Create an HMAC-signed session token
 * Format: timestamp(base36):nonce(hex):signature(hex)
 */
export function createSignedToken(): string {
  const secret =
    process.env.VOXXO_TOKEN_SECRET ||
    process.env.VOXXO_ACCESS_CODE ||
    "fallback";
  const timestamp = Date.now().toString(36);
  const nonce = randomBytes(16).toString("hex");
  const payload = `${timestamp}:${nonce}`;
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, 32);
  return `${payload}:${signature}`;
}

/**
 * Verify an HMAC-signed session token
 * Returns validity and expiration status
 */
export function verifySignedToken(token: string): {
  valid: boolean;
  expired?: boolean;
} {
  if (!token || typeof token !== "string") return { valid: false };

  const parts = token.split(":");
  if (parts.length !== 3) return { valid: false };

  const [timestamp, _nonce, providedSignature] = parts;
  const secret =
    process.env.VOXXO_TOKEN_SECRET ||
    process.env.VOXXO_ACCESS_CODE ||
    "fallback";
  const payload = `${timestamp}:${_nonce}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, 32);

  // Timing-safe comparison
  if (providedSignature.length !== expectedSignature.length)
    return { valid: false };
  const isValid = timingSafeEqual(
    Buffer.from(providedSignature),
    Buffer.from(expectedSignature),
  );
  if (!isValid) return { valid: false };

  // Check expiration
  const tokenTime = parseInt(timestamp, 36);
  if (Date.now() - tokenTime > TOKEN_EXPIRY_MS) {
    return { valid: false, expired: true };
  }

  return { valid: true };
}
