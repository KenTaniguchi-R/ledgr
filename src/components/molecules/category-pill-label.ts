import { UNCATEGORIZED } from "@/lib/labels";

export type CategoryPillVariant = "category" | "transfer" | "uncategorized";

/**
 * Decides what a transaction's category pill should read. Transfers (CC
 * autopay, inter-account moves, P2P) legitimately have no spending category,
 * so an uncategorized transfer reads "Transfer" rather than "Uncategorized" —
 * it isn't a categorization gap. An assigned category always wins.
 */
export function categoryPillLabel(
  categoryName: string | null,
  isTransfer: boolean,
): { text: string; variant: CategoryPillVariant } {
  if (categoryName) return { text: categoryName, variant: "category" };
  if (isTransfer) return { text: "Transfer", variant: "transfer" };
  return { text: UNCATEGORIZED, variant: "uncategorized" };
}
