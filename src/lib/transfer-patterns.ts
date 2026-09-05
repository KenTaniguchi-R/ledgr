export type SingleLegTransferSource = "pattern" | "suggested";

// Curated, narrow on purpose — these fire immediately (isTransfer=true, no
// human in the loop), so a false positive here silently drops real spending
// from totals. Extend by adding to the list, not by loosening the matcher.
const CARD_PAYOFF_MEMOS = [
  "gsbank payment",
  "applecard",
  "autopay",
  "credit card payment",
  "cc payment thank you",
];

// Self-transfer phrasing: requires both "transfer" and a self-account keyword
// so an unrelated "Wire Transfer Fee" merchant charge doesn't match.
const SELF_TRANSFER_KEYWORD = /\btransfer\b/i;
const SELF_ACCOUNT_KEYWORD = /\b(savings|brokerage|ira)\b/i;

// Bare P2P processor names — lower confidence than the patterns above because
// the same rail is used for both real payments to people and moving your own
// money, so these land in the review queue instead of auto-excluding.
const P2P_PROCESSORS = ["zelle", "venmo", "cash app", "cashapp", "paypal"];

function matchesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/**
 * Classifies a single transaction (no matching leg required) as a likely
 * transfer from its name/merchant text alone. Returns "pattern" for
 * high-confidence matches (known card payoff memos, named self-transfers to
 * savings/brokerage/IRA — trusted immediately), "suggested" for low-confidence
 * matches (bare P2P processor names — routed to manual review instead), or
 * null when nothing matches.
 */
export function classifySingleLegTransfer(
  name: string,
  merchantName: string | null,
): SingleLegTransferSource | null {
  const text = `${name} ${merchantName ?? ""}`.toLowerCase().trim();

  if (matchesAny(text, CARD_PAYOFF_MEMOS)) return "pattern";
  if (SELF_TRANSFER_KEYWORD.test(text) && SELF_ACCOUNT_KEYWORD.test(text)) return "pattern";
  if (matchesAny(text, P2P_PROCESSORS)) return "suggested";

  return null;
}
