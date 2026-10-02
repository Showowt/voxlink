/**
 * hallucination-artifacts.ts — SHARED WHISPER-HALLUCINATION SIGNATURES
 *
 * Whisper (and other STT models) confidently invent stock phrases on silence,
 * noise, breathing, echo, or far-field audio (TV/YouTube). The residue is
 * YouTube-caption and podcast-outro boilerplate: "Thanks for watching",
 * "This video is sponsored by…", "Thank you for using…", "Gracias por ver el
 * video", subtitle credits, etc. On a translated call these surface as
 * "random words popping up that nobody said".
 *
 * This module is the SINGLE source of truth for those signatures, shared by:
 *   - /api/transcribe  — drop at the source, in the SPEAKER'S language
 *   - /api/translate   — refuse to translate an artifact, so a Spanish
 *                        hallucination ("Gracias por ver el video") can't be
 *                        turned into an English phantom ("Thanks for watching")
 *                        that no source-language filter could ever catch.
 *
 * Two tiers:
 *   1. ARTIFACT_PATTERNS / amara.org — NEVER real conversation. Drop always.
 *   2. AMBIGUOUS_FILLERS — people DO say these ("thank you", "gracias", "bye").
 *      The caller drops them only when segment confidence corroborates silence.
 */

/**
 * Normalize for matching: lowercase, collapse whitespace, and strip BOTH
 * leading and trailing punctuation/quotes/ornaments. The old filter stripped
 * only trailing punctuation, so a leading "¡", "¿", "…" or quote defeated every
 * exact entry.
 */
export function normalizeArtifact(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s"'“”«»¡¿.,!?…·・-]+/, "")
    .replace(/[\s"'“”«».,!?。！？…·・-]+$/, "")
    .trim();
}

/**
 * Subtitle / outro / ad-read families across the app's supported languages.
 * Each is designed to match a WHOLE short hallucinated utterance; the few
 * substring matches (amara.org, "sponsored by") are strings that never occur
 * in real spoken conversation, so matching them anywhere is safe.
 */
// NOTE: these run against normalizeArtifact() output (lowercased, trimmed,
// surrounding punctuation/quotes already stripped). Standalone YouTube/outro
// residue is ANCHORED (^…$) so it can't flag a genuine sentence that merely
// contains the word; a few strings that are never real conversation
// (amara.org, "sponsored by") match as substrings. Trailing \b is avoided
// after accented letters (é/í/… are non-word chars in JS regex, which breaks it).
export const ARTIFACT_PATTERNS: RegExp[] = [
  // Subtitle-credit residue (any language) — safe anywhere in the string
  /amara\s*\.\s*org/i,
  /\bsubtitl(es|ing)\b[^.]*\b(by|community)\b/i,

  // ── English outros: "thanks for watching/listening/using …" ──
  // Limited to the verbs Whisper actually hallucinates, so genuine
  // "thank you for your help/support" is NOT caught.
  /\b(thank you|thanks|thank you so much|thank you very much)\b.*\bfor\b.*\b(watching|listening|using)\b/i,
  /\b(this (video|channel) (is|was) )?sponsored by\b/i,
  /\bbrought to you by\b/i,
  /\bsubscribe to (my|the|our) channel\b/i,
  /\bdon'?t forget to subscribe\b/i,
  /\bsee you (in the )?next (video|episode)\b/i,
  /\b(hit|smash) (the|that) (like button|bell|subscribe)\b/i,
  // Standalone like/subscribe call-to-action (anchored — must be ~the whole
  // utterance, so "subscribe me to the newsletter" is NOT caught)
  /^(please\s+)?(like,?\s+(and\s+)?)?subscribe$/i,
  /^like and subscribe$/i,

  // ── Spanish ──
  /\bgracias por (ver|mirar|acompañarnos|ver el video|ver este video|su atención)\b/i,
  /\bgracias por usar\b/i,
  /\bsuscr[ií]b(ir|ete|anse|irte)\b[^.]*\bcanal\b/i,
  /^(no olvides(\s+de)?\s+)?suscr[ií]b(ir|ete|irte|anse)$/i,
  /\bpatrocinad[oa] por\b/i,
  /\bsubt[ií]tulos?\b[^.]*\b(por|realizad|creado|comunidad)\b/i,
  /\bsubtitulad[oa] por\b/i,

  // ── Portuguese ──
  /\bobrigad[oa] por (assistir|ver|usar)\b/i,
  /\bse inscreva no canal\b/i,
  /\blegendas?\b[^.]*\b(por|pela|feita)\b/i,

  // ── French ──
  /\bmerci d'?avoir regard/i,
  /^abonnez[-\s]?vous/i,
  /\bsous[-\s]?titr(es|age)\b[^.]*\b(par|r[ée]alis)/i,

  // ── German ──
  /\bdanke f[üu]rs? (zuschauen|zusehen)/i,
  /\buntertitel\b[^.]*\b(von|der|im auftrag)/i,

  // ── Music / applause / silence markers (any language) ──
  /^\[?\(?\s*(m[uú]sica|music|musik|musique|applause|aplausos|applaudissements|silence|silencio|blank_audio|inaudible)\s*\)?\]?$/i,
  /^[\s.,!?。！？…♪·・♫🎵]+$/,
];

/**
 * Phrases people GENUINELY say, which Whisper also emits on silence. Dropped
 * by the caller ONLY when the segment's own confidence corroborates silence.
 * Normalized (via normalizeArtifact) exact matches.
 */
export const AMBIGUOUS_FILLERS = new Set<string>([
  // English
  "thank you", "thanks", "thank you very much", "you", "bye", "bye bye",
  "goodbye", "okay", "ok", "the end", "yeah", "yep",
  // Spanish / Portuguese / French / Italian
  "gracias", "muchas gracias", "adiós", "adios", "chao", "vale",
  "obrigado", "obrigada", "merci", "au revoir", "grazie", "ciao",
  // CJK fillers
  "はい", "音", "ご視聴ありがとうございました", "谢谢", "感谢观看", "字幕",
]);

/**
 * True when `text` is subtitle/outro/ad-read residue that is NEVER real
 * conversation — safe to drop unconditionally (tier 1).
 */
export function looksLikeArtifact(text: string): boolean {
  const n = normalizeArtifact(text);
  if (!n) return true;
  return ARTIFACT_PATTERNS.some((re) => re.test(n));
}

/** True when `text` is an ambiguous filler (tier 2 — confidence-gate before dropping). */
export function isAmbiguousFiller(text: string): boolean {
  return AMBIGUOUS_FILLERS.has(normalizeArtifact(text));
}
