import type { TransactionRow } from "@/queries/transactions";

/**
 * Why an edited row no longer belongs to the drill-down it was opened from, or
 * null while it still does.
 *
 * The drill-down population is `spendingBaseConditions`/`incomeBaseConditions`
 * plus an optional category. Edits from the sheet can move a row out of it —
 * categorizing an Uncategorized row, excluding it from spend, hiding it. The
 * sheet keeps such rows in place (dimmed, with this reason) instead of dropping
 * them, so ↑↓ stepping doesn't skip and the edit stays visible until the sheet
 * closes and the report refreshes.
 *
 * `transferOptInCategoryIds`: categories whose transfers count as spending
 * (`includeTransferInSpending`), so such a row is not reported as excluded.
 *
 * `categoryId`: a category id, `null` for the Uncategorized drill-down, or
 * `undefined` when the drill-down has no category constraint.
 */
const NO_CATEGORIES: ReadonlySet<string> = new Set();

/**
 * Client-side mirror of the transfer branch of `includedInSpending`: an
 * outgoing transfer in a category that opted in counts as spending, except
 * brokerage activity, which never does.
 */
function countsAsSpending(
  row: Pick<TransactionRow, "categoryId" | "normalizedAmount" | "transferSource">,
  optedIn: ReadonlySet<string>,
): boolean {
  return (
    row.normalizedAmount < 0 &&
    row.transferSource !== "investment_account" &&
    row.categoryId !== null &&
    optedIn.has(row.categoryId)
  );
}

export function drillDownExitReason(
  row: Pick<
    TransactionRow,
    "categoryId" | "categoryName" | "isTransfer" | "isHidden" | "normalizedAmount" | "transferSource"
  >,
  categoryId: string | null | undefined,
  transferOptInCategoryIds: ReadonlySet<string> = NO_CATEGORIES,
): string | null {
  if (row.isHidden) return "Hidden";
  if (row.isTransfer && !countsAsSpending(row, transferOptInCategoryIds)) return "Excluded from spend";
  if (categoryId !== undefined && row.categoryId !== categoryId) {
    return row.categoryId === null ? "Moved to Uncategorized" : `Moved to ${row.categoryName ?? "another category"}`;
  }
  return null;
}
