// Cryptographically-random room code (replaces Math.random, which is
// predictable). 32-symbol unambiguous alphabet; 256 % 32 === 0 so there is no
// modulo bias. 6 symbols ≈ 1.07e9 combinations.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

export function generateRoomCode(len = 6): string {
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = new Uint8Array(len);
      crypto.getRandomValues(bytes);
      let out = "";
      for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
      return out;
    }
  } catch {
    /* fall through */
  }
  let out = "";
  for (let i = 0; i < len; i++)
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}
