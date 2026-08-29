import type { AccountType } from "@/db/schema/accounts";

const ASSET_TYPES = new Set(["checking", "savings", "investment", "other"]);
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export function classifyAccountType(type: string): "asset" | "liability" {
  if (LIABILITY_TYPES.has(type)) return "liability";
  return "asset";
}

// Ordered most-specific first: a name like "Discover Bank Checking" has to hit
// the deposit rule before the card-brand rule, or every Discover/Amex deposit
// account gets filed as a credit card.
const NAME_TYPE_RULES: { type: AccountType; pattern: RegExp }[] = [
  { type: "checking", pattern: /\b(checking|chequing|debit\s+card|deposit)\b/i },
  { type: "loan", pattern: /\b(loan|mortgage|heloc|lease|financing)\b/i },
  {
    type: "investment",
    pattern:
      /\b(brokerage|portfolio|invest\w*|ira|roth|401\s*k|403\s*b|hsa|securities|individual|crypto)\b/i,
  },
  {
    type: "credit",
    pattern:
      /\b(credit\s*card|creditcard|visa|mastercard|master\s*card|amex|american\s+express|discover|rewards\s+card|signature|platinum|sapphire|autograph)\b|\bcard\b/i,
  },
  { type: "savings", pattern: /\b(savings|saving|money\s*market|cd|certificate)\b/i },
];

/**
 * Best-effort account type from a connector-supplied display name.
 *
 * SimpleFIN sends no type field at all, so without this every account defaults
 * to "checking" and credit cards never register as debt. This is a starting
 * guess for the classification step, not a substitute for it — the user still
 * confirms.
 */
export function inferAccountTypeFromName(name: string): AccountType {
  for (const { type, pattern } of NAME_TYPE_RULES) {
    if (pattern.test(name)) return type;
  }
  return "checking";
}

export { ASSET_TYPES, LIABILITY_TYPES };
