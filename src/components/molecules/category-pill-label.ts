import { UNCATEGORIZED } from "@/lib/labels";

export type CategoryPillVariant = "category" | "transfer" | "investment" | "uncategorized";

/**
 * Decides what a transaction's category pill should read. Transfers (CC
 * autopay, inter-account moves, P2P) legitimately have no spending category,
 * so an uncategorized transfer reads "Transfer" rather than "Uncategorized" —
 * it isn't a categorization gap. Investment-account activity (brokerage
 * fills, clearing fees) is tagged the same way under the hood but reads
 * "Investment" — it's excluded from spend/income for the same reason, but
 * it isn't a transfer in the user-facing sense. An assigned category always
 * wins over either label.
 */
export function categoryPillLabel(
  categoryName: string | null,
  isTransfer: boolean,
  transferSource?: string | null,
): { text: string; variant: CategoryPillVariant } {
  if (categoryName) return { text: categoryName, variant: "category" };
  if (isTransfer && transferSource === "investment_account") {
    return { text: "Investment", variant: "investment" };
  }
  if (isTransfer) return { text: "Transfer", variant: "transfer" };
  return { text: UNCATEGORIZED, variant: "uncategorized" };
}
