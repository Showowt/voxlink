// Join-link sharing that works in Safari AND the iOS WKWebView shell.
// navigator.clipboard can silently fail in WKWebView, so every path has a
// fallback and the caller always gets truthful feedback.

export type ShareResult = "shared" | "copied" | "failed";

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  return legacyCopy(text);
}

export async function shareJoinLink(
  url: string,
  text: string,
): Promise<ShareResult> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text, url });
      return "shared";
    } catch (err) {
      // AbortError = user closed the sheet; treat as handled, not a failure
      if (err instanceof Error && err.name === "AbortError") return "shared";
      // Any other error → fall through to copy
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}

export function whatsappShareUrl(url: string, text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}
