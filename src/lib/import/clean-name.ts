/**
 * Turn a raw bank/CSV transaction description into a human-readable payee name.
 *
 * Bank feeds bury the merchant inside boilerplate: a transaction-type prefix
 * ("ACH ELECTRONIC DEBIT"), embedded date/time stamps ("May11 05:25a"),
 * card/check/reference numbers, and Zelle-style ID fields. This strips that
 * noise and normalises casing, while never returning an empty string.
 *
 * The raw description is always preserved separately in `originalName`, so this
 * is purely a display/search/rule-matching improvement — nothing is lost.
 */

// Leading transaction-type prefixes. `label` is a friendly fallback used when
// nothing meaningful survives stripping (e.g. a bare "ZELLE DEBIT 9054").
const TYPE_PREFIXES: { pattern: RegExp; label?: string }[] = [
  { pattern: /^ACH\s+ELECTRONIC\s+(?:DEBIT|CREDIT)\s*-?\s*/i },
  { pattern: /^ACH\s+(?:DEBIT|CREDIT)\s*-?\s*/i },
  { pattern: /^ZELLE\s+(?:DEBIT|CREDIT)\s*-?\s*/i, label: "Zelle" },
  { pattern: /^INSTANT\s+PAYMENT\s+(?:DEBIT|CREDIT)\s*-?\s*/i },
  { pattern: /^POS\s+(?:DEBIT|PURCHASE)\s*-?\s*/i },
  { pattern: /^DEBIT\s+CARD\s+PURCHASE\s*-?\s*/i },
  { pattern: /^CHECKCARD\s+/i },
  { pattern: /^RECURRING\s+PAYMENT\s*-?\s*/i },
  { pattern: /^(?:EXTERNAL|PREAUTHORIZED)\s+(?:WITHDRAWAL|DEPOSIT|CREDIT|DEBIT)\s*-?\s*/i },
  { pattern: /^BILL\s+PAY(?:MENT)?\s*-?\s*/i },
];

function stripNoise(s: string): string {
  return s
    .replace(/\S*:\S*/g, " ") // colon fields: HH:MMa times, ID:xxx, PAY ID:xxx
    .replace(/\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{1,2}\b/gi, " ") // May11
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ") // 04/12, 04/12/26
    .replace(/\b\d{3,}[A-Za-z0-9]*\b/g, " ") // long reference / alphanumeric ref tokens
    .replace(/\b\d+\b/g, " ") // any remaining standalone numeric token
    .replace(/\s{2,}/g, " ")
    .trim();
}

function caseToken(token: string): string {
  if (/[a-z]/.test(token)) return token; // already has lowercase — leave as authored
  if (!/[A-Z]/.test(token)) return token; // no letters (numbers/symbols) — leave
  // All-uppercase: keep short tokens as acronyms (GS, TY, IRS, CVS, CRD),
  // title-case longer words (CHASE -> Chase, AUTOPAY -> Autopay).
  const letters = token.replace(/[^A-Za-z]/g, "");
  if (letters.length <= 3) return token;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function cleanTokens(s: string): string {
  return s
    .split(/\s+/)
    .map((t) => t.replace(/^[-–—:.,]+|[-–—:.,]+$/g, "")) // strip edge punctuation
    .filter(Boolean)
    .map(caseToken)
    .join(" ")
    .trim();
}

export function cleanTransactionName(raw: string): string {
  const original = raw.trim();
  if (!original) return "";

  // Zelle / person-to-person feeds put the real party in a NAME: field.
  const nameField = original.match(/\bNAME:\s*([A-Za-z][A-Za-z .'-]*)/i);
  if (nameField) {
    const extracted = cleanTokens(nameField[1]);
    if (extracted) return extracted;
  }

  let label: string | undefined;
  let s = original;
  for (const { pattern, label: l } of TYPE_PREFIXES) {
    if (pattern.test(s)) {
      s = s.replace(pattern, "");
      label = l;
      break;
    }
  }

  const cleaned = cleanTokens(stripNoise(s));
  if (cleaned) return cleaned;

  // Nothing meaningful survived — prefer the prefix's friendly label, else the
  // best-effort cleaned original, else the raw original (never empty).
  return label ?? (cleanTokens(original) || original);
}
