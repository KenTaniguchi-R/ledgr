/**
 * Validation for a category rule's match pattern.
 *
 * Kept separate from the server action so it can be exercised without a
 * database: the rule it enforces is the one that matters most, and a rule this
 * consequential should not be reachable only through a round trip.
 *
 * The categorization engine matches with
 * `target.includes(pattern.toLowerCase())` (`lib/categorization/engine.ts`).
 * `"".includes()` is true for *every* string, so a single blank pattern would
 * match every transaction in the feed and, being tier 1, would outrank every
 * other categorization step. One empty rule can therefore miscategorize an
 * entire account.
 */

/** Longest pattern we store. Generous for a merchant name; bounded so the column can't be abused. */
export const MAX_RULE_PATTERN_LENGTH = 200;

/**
 * Normalize a user-entered pattern, or return null if it is not usable.
 *
 * Trimming happens before the empty check, so a pattern of only whitespace is
 * rejected rather than stored — and a pattern the user typed with a stray
 * leading space still matches, since the engine does no trimming of its own.
 */
export function normalizeRulePattern(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_RULE_PATTERN_LENGTH) return null;
  return trimmed;
}
