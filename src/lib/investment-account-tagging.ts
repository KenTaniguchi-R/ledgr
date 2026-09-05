import { eq, and, ne, or, isNull, inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions, accounts } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import { withHousehold } from "@/lib/household-context";

/**
 * Tags every not-yet-decided transaction on one of the household's
 * investment-type accounts (brokerage fills, clearing fees) as non-spending,
 * the same way sync.ts tags them going forward. Deterministic and
 * idempotent: only touches rows that are still `isTransfer=false` and whose
 * transferSource isn't a user decision (manual/manual_rejected), so a repeat
 * call naturally skips already-tagged or user-corrected rows.
 */
export async function applyInvestmentAccountTagging(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<{ tagged: number }> {
  return withHousehold(
    householdId,
    async (tx) => {
      const scoped = scopedQuery(householdId, tx);

      const investmentAccounts = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.householdId, householdId), eq(accounts.type, "investment")));

      if (investmentAccounts.length === 0) return { tagged: 0 };
      const investmentAccountIds = investmentAccounts.map((a) => a.id);

      const untagged = () =>
        scoped.where(
          transactions,
          notDeleted(transactions),
          inArray(transactions.accountId, investmentAccountIds),
          eq(transactions.isTransfer, false),
          or(
            isNull(transactions.transferSource),
            ne(transactions.transferSource, "manual_rejected"),
          ),
        );

      const candidates = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(untagged());

      if (candidates.length === 0) return { tagged: 0 };

      await tx.update(transactions)
        .set({ isTransfer: true, transferSource: "investment_account", updatedAt: new Date() })
        .where(untagged());

      return { tagged: candidates.length };
    },
    db,
  );
}
