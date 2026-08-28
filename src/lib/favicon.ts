const FAVICON_FETCH_TIMEOUT_MS = 5000;

/**
 * Best-effort logo for any domain, used both for SimpleFIN institution icons
 * (which never arrive with logo bytes) and for AI-guessed merchant domains.
 * Every failure path — network error, timeout, non-2xx, non-image response —
 * returns null rather than throwing, so callers can treat this as optional
 * and fall back to the initials avatar.
 *
 * Uses Google's favicon endpoint rather than a raw favicon.ico proxy (e.g.
 * DuckDuckGo's) because it returns a single decoded PNG/JPEG at the
 * requested size — a multi-resolution .ico bundle left several embedded
 * frames for the browser to pick from, and browsers don't reliably choose
 * the largest one when rendering it via <img>, so logos rendered noticeably
 * smaller/blurrier than the source image actually was.
 */
export async function fetchFaviconDataUri(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`, {
      signal: AbortSignal.timeout(FAVICON_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type");
    if (!contentType?.startsWith("image/")) return null;

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) return null;

    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}
