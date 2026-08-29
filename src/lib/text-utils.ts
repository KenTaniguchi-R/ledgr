export function titleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Collapses runs of the Unicode replacement character (U+FFFD) — left behind
 * when an upstream feed (e.g. a bank's SimpleFIN/Plaid response) mis-decodes
 * a byte sequence before we ever see it — into a single space, then trims.
 */
export function sanitizeMojibake(str: string): string {
  return str
    .replace(/�+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
