const DUCKDUCKGO_FAVICON_TIMEOUT_MS = 5000;

/**
 * Best-effort institution icon for a SimpleFIN connection, keyed off the
 * institution's domain (SimpleFIN, unlike Plaid, never sends logo bytes).
 * Every failure path — network error, timeout, non-2xx, non-image response —
 * returns null rather than throwing, so callers can treat this as optional
 * and fall back to the initials avatar.
 */
export async function fetchInstitutionLogoDataUri(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
      signal: AbortSignal.timeout(DUCKDUCKGO_FAVICON_TIMEOUT_MS),
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
