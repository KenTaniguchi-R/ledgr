/**
 * Collapses an account number that appears twice in a provider-supplied name.
 *
 * SimpleFIN appends " (last4)" to whatever the institution calls the account.
 * When the institution's own name already ends in those digits the result reads
 * the number twice — "Checking-1135 (1135)".
 *
 * The suffix is only redundant when the rest of the name already ends with the
 * same digits. Elsewhere it is load-bearing: "Robinhood individual (1722)" and
 * "Robinhood individual (8904)" are two different accounts distinguished by
 * nothing else, so the suffix stays.
 */

/** Trailing " (1234)" — exactly four digits, the last-4 convention. */
const TRAILING_MASK = /^(.*?)\s*\((\d{4})\)$/;

/**
 * Characters an institution may put between the name and the digits.
 * Covers "Checking-1135", "Card **3640", "CARD ...2842", "Savings 4403".
 */
const SEPARATORS = "[\\s\\-–—*.·#:]*";

export function accountDisplayName(name: string): string {
  const match = TRAILING_MASK.exec(name);
  if (!match) return name;

  const [, base, digits] = match;

  // Anchor to the end of the base and require the digits to be a whole token,
  // so "Checking-11350 (1350)" keeps its suffix — 1350 is a fragment of 11350,
  // not the account number the institution wrote down.
  const alreadyPresent = new RegExp(`(?:^|${SEPARATORS})${digits}$`).test(base);
  if (!alreadyPresent) return name;

  // A digit immediately before the match means we landed mid-number.
  const precedingChar = base.charAt(base.length - digits.length - 1);
  if (/\d/.test(precedingChar)) return name;

  return base;
}
