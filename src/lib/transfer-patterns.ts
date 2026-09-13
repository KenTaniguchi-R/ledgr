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

// Reward redemptions posted as a statement credit ("Points Redeemed",
// "Thankyou Points Redeemed TY OR301166076"). Not spending and not income —
// counting them as either skews both sides of a report, so they are excluded
// the same way a transfer is. Anchored on the two-word phrase rather than a
// bare "points" so a purchase at a merchant with "Points" in its name (Five
// Points Pizza) cannot match.
const REWARD_REDEMPTION_MEMOS = [
  "points redeemed",
  "points redemption",
  "reward redemption",
];

// Self-transfer phrasing: requires both a movement verb and a self-account
// keyword so an unrelated "Wire Transfer Fee" merchant charge doesn't match.
// "rollover" is here because a retirement rollover is phrased as a movement
// into an account rather than as a "transfer" ("Direct rollover of $X into
// Robinhood Traditional IRA").
const SELF_TRANSFER_KEYWORD = /\b(transfer|rollover)\b/i;
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
 * high-confidence matches (known card payoff memos, reward redemptions, and
 * named self-transfers or rollovers to savings/brokerage/IRA — trusted
 * immediately), "suggested" for low-confidence matches (bare P2P processor
 * names — routed to manual review instead), or null when nothing matches.
 */
export function classifySingleLegTransfer(
  name: string,
  merchantName: string | null,
): SingleLegTransferSource | null {
  const text = `${name} ${merchantName ?? ""}`.toLowerCase().trim();

  if (matchesAny(text, CARD_PAYOFF_MEMOS)) return "pattern";
  if (matchesAny(text, REWARD_REDEMPTION_MEMOS)) return "pattern";
  if (SELF_TRANSFER_KEYWORD.test(text) && SELF_ACCOUNT_KEYWORD.test(text)) return "pattern";
  if (matchesAny(text, P2P_PROCESSORS)) return "suggested";

  return null;
}
