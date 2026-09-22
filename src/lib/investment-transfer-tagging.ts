import type { transactions } from "@/db/schema";

type TransferSource = (typeof transactions.$inferInsert)["transferSource"];

/**
 * Every transaction on an account.type="investment" account (brokerage fills,
 * clearing fees) is deterministically non-spending — unlike the PFC/pattern
 * transfer heuristics, there's no ambiguity to preserve a provider-asserted
 * isTransfer/transferSource for on an investment-account row.
 */
export function computeInvestmentTransferTagging(
  isInvestmentAccount: boolean,
  providerIsTransfer: boolean,
): { isTransfer: boolean; transferSource: TransferSource } {
  if (isInvestmentAccount) {
    return { isTransfer: true, transferSource: "investment_account" };
  }
  return { isTransfer: providerIsTransfer, transferSource: providerIsTransfer ? "pfc" : null };
}
