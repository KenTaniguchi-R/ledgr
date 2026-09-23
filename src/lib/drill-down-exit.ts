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
 * `categoryId`: a category id, `null` for the Uncategorized drill-down, or
 * `undefined` when the drill-down has no category constraint.
 */
export function drillDownExitReason(
  row: Pick<TransactionRow, "categoryId" | "categoryName" | "isTransfer" | "isHidden">,
  categoryId: string | null | undefined,
): string | null {
  if (row.isHidden) return "Hidden";
  if (row.isTransfer) return "Excluded from spend";
  if (categoryId !== undefined && row.categoryId !== categoryId) {
    return row.categoryId === null ? "Moved to Uncategorized" : `Moved to ${row.categoryName ?? "another category"}`;
  }
  return null;
}
