export function sanitizeCallbackUrl(url: string | null): string {
  if (!url || !url.startsWith("/") || url.startsWith("//")) {
    return "/";
  }
  try {
    const decoded = decodeURIComponent(url);
    if (decoded.startsWith("//") || /^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(decoded)) {
      return "/";
    }
  } catch {
    return "/";
  }
  return url;
}
