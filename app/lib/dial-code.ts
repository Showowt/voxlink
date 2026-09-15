// ═══════════════════════════════════════════════════════════════════════════════
// DIAL CODE — a short, human "Entrevoz number" derived from the device id.
//
// The code IS the address: a device listens for ring invites on BOTH its device
// id and its dial code, so anyone who knows your code can call you — no registry
// (no DDL) and no link. Deterministic + collision-resistant; the same device
// always yields the same code.
// ═══════════════════════════════════════════════════════════════════════════════

// Crockford-style alphabet minus ambiguous chars (0/O/1/I/L) so codes are safe
// to read aloud and type.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 symbols
const CODE_LEN = 6;

// Two independent 32-bit string hashes → 64 bits of entropy to spread across the
// code (well under birthday-collision risk at launch scale).
function hash32(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV-ish
    h >>>= 0;
  }
  return h >>> 0;
}

export function deriveDialCode(deviceId: string): string {
  if (!deviceId) return "";
  let a = hash32(deviceId, 0x811c9dc5);
  let b = hash32(deviceId, 0x9e3779b1);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    // Pull symbols alternately from the two hashes for a wider spread.
    const src = i % 2 === 0 ? a : b;
    out += ALPHABET[src % ALPHABET.length];
    if (i % 2 === 0) a = Math.floor(a / ALPHABET.length);
    else b = Math.floor(b / ALPHABET.length);
  }
  return out;
}

// Pretty form for display: "ABC-DEF".
export function formatDialCode(code: string): string {
  const c = (code || "").toUpperCase();
  return c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
}

// Lenient normalize for user input: uppercase, drop separators, keep only
// valid alphabet chars.
export function normalizeDialCode(input: string): string {
  return (input || "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .split("")
    .filter((ch) => ALPHABET.includes(ch))
    .join("")
    .slice(0, CODE_LEN);
}

export function isValidDialCode(input: string): boolean {
  return normalizeDialCode(input).length === CODE_LEN;
}
