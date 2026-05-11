import { eq, and, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  transactions,
  investmentHoldings,
  holdingsHistory,
  investmentTransactions,
  balanceHistory,
  recurringTransactions,
} from "@/db/schema";

interface OrphanMatch {
  orphanId: string;
  activeId: string;
  orphanName: string;
  orphanType: string;
}

async function findOrphanMatches(): Promise<OrphanMatch[]> {
  const deletedAccts = await db
    .select({
      id: accounts.id,
      householdId: accounts.householdId,
      name: accounts.name,
      type: accounts.type,
    })
    .from(accounts)
    .where(isNotNull(accounts.deletedAt));

  const matches: OrphanMatch[] = [];

  for (const orphan of deletedAccts) {
    const candidates = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, orphan.householdId),
          eq(accounts.name, orphan.name),
          eq(accounts.type, orphan.type),
          isNull(accounts.deletedAt),
        ),
      );

    if (candidates.length === 1) {
      matches.push({
        orphanId: orphan.id,
        activeId: candidates[0].id,
        orphanName: orphan.name,
        orphanType: orphan.type,
      });
    } else if (candidates.length > 1) {
      console.log(`[skip] Ambiguous match for "${orphan.name}" (${orphan.type}): ${candidates.length} active candidates`);
    }
  }

  return matches;
}

async function migrateOrphan(match: OrphanMatch, dryRun: boolean): Promise<void> {
  const { orphanId, activeId, orphanName, orphanType } = match;
  console.log(`\n[migrate] "${orphanName}" (${orphanType}): ${orphanId} → ${activeId}`);

  if (dryRun) {
    const [txnCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(transactions)
      .where(eq(transactions.accountId, orphanId));
    const [holdingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(investmentHoldings)
      .where(eq(investmentHoldings.accountId, orphanId));
    const [balHistCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(balanceHistory)
      .where(eq(balanceHistory.accountId, orphanId));
    const [holdHistCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(holdingsHistory)
      .where(eq(holdingsHistory.accountId, orphanId));
    const [invTxnCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(investmentTransactions)
      .where(eq(investmentTransactions.accountId, orphanId));

    console.log(`  [dry-run] Would move: ${txnCount.count} transactions, ${holdingCount.count} holdings, ${balHistCount.count} balance history, ${holdHistCount.count} holdings history, ${invTxnCount.count} investment txns`);
    return;
  }

  await db.transaction(async (tx) => {
    // 1. Re-point transactions (splits cascade automatically)
    const txnResult = await tx
      .update(transactions)
      .set({ accountId: activeId })
      .where(eq(transactions.accountId, orphanId));
    console.log(`  transactions: ${txnResult.rowCount ?? 0} moved`);

    // 2. Re-point investment holdings
    const holdResult = await tx
      .update(investmentHoldings)
      .set({ accountId: activeId })
      .where(eq(investmentHoldings.accountId, orphanId));
    console.log(`  investmentHoldings: ${holdResult.rowCount ?? 0} moved`);

    // 3. Re-point investment transactions
    const invTxnResult = await tx
      .update(investmentTransactions)
      .set({ accountId: activeId })
      .where(eq(investmentTransactions.accountId, orphanId));
    console.log(`  investmentTransactions: ${invTxnResult.rowCount ?? 0} moved`);

    // 4. Balance history — delete conflicts first, then re-point
    await tx.execute(sql`
      DELETE FROM balance_history
      WHERE account_id = ${orphanId}
        AND (account_id, date) IN (
          SELECT ${orphanId}, date FROM balance_history WHERE account_id = ${activeId}
        )
    `);
    const balResult = await tx
      .update(balanceHistory)
      .set({ accountId: activeId })
      .where(eq(balanceHistory.accountId, orphanId));
    console.log(`  balanceHistory: ${balResult.rowCount ?? 0} moved`);

    // 5. Holdings history — delete conflicts first, then re-point
    await tx.execute(sql`
      DELETE FROM holdings_history
      WHERE account_id = ${orphanId}
        AND (account_id, plaid_security_id, date) IN (
          SELECT ${orphanId}, plaid_security_id, date FROM holdings_history WHERE account_id = ${activeId}
        )
    `);
    const holdHistResult = await tx
      .update(holdingsHistory)
      .set({ accountId: activeId })
      .where(eq(holdingsHistory.accountId, orphanId));
    console.log(`  holdingsHistory: ${holdHistResult.rowCount ?? 0} moved`);

    // 6. Recurring transactions
    const recResult = await tx
      .update(recurringTransactions)
      .set({ accountId: activeId })
      .where(eq(recurringTransactions.accountId, orphanId));
    console.log(`  recurringTransactions: ${recResult.rowCount ?? 0} moved`);

    // 7. Hard-delete the orphaned account
    await tx.delete(accounts).where(eq(accounts.id, orphanId));
    console.log(`  deleted orphan account ${orphanId}`);
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`\n=== Orphaned Account Migration ${dryRun ? "(DRY RUN)" : ""} ===\n`);

  const matches = await findOrphanMatches();

  if (matches.length === 0) {
    console.log("No orphaned accounts found.");
    return;
  }

  console.log(`Found ${matches.length} orphan → active matches:`);
  for (const m of matches) {
    console.log(`  "${m.orphanName}" (${m.orphanType}): ${m.orphanId} → ${m.activeId}`);
  }

  for (const match of matches) {
    await migrateOrphan(match, dryRun);
  }

  console.log(`\n=== Migration complete (${matches.length} accounts processed) ===\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
