import { v4 as uuid } from "uuid";
import { eq, inArray } from "drizzle-orm";
import { todayDateString } from "@/lib/date-utils";
import { db as defaultDb, type LedgrDb } from "@/db";
import {
  investmentHoldings,
  holdingsHistory,
  investmentTransactions,
  accounts,
} from "@/db/schema";
import type { HoldingRow, InvestmentTxnRow } from "./investments-process";

// ─── Apply (Atomic DB Write) ────────────────────────────────────────────────

export async function applyInvestmentsToDb(
  db: LedgrDb,
  holdingRows: HoldingRow[],
  txnRows: InvestmentTxnRow[],
  itemId: string,
): Promise<{ holdingsUpserted: number; txnsInserted: number }> {
  let holdingsUpserted = 0;
  let txnsInserted = 0;
  const today = todayDateString();

  await db.transaction(async (tx) => {
    const itemAccounts = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.plaidItemId, itemId));
    const itemAccountIds = itemAccounts.map((a) => a.id);

    if (itemAccountIds.length > 0) {
      await tx.delete(investmentHoldings)
        .where(inArray(investmentHoldings.accountId, itemAccountIds));
    }

    for (const row of holdingRows) {
      await tx.insert(investmentHoldings)
        .values({
          id: row.id,
          accountId: row.accountId,
          plaidSecurityId: row.plaidSecurityId,
          securityName: row.securityName,
          ticker: row.ticker,
          quantity: row.quantity,
          costBasis: row.costBasis,
          currentValue: row.currentValue,
          type: row.type as "stock" | "etf" | "mutual_fund" | "bond" | "crypto" | "cash" | "other",
          sector: row.sector,
          currency: row.currency,
          asOfDate: row.asOfDate,
        });
      holdingsUpserted++;
    }

    for (const row of txnRows) {
      const result = await tx
        .insert(investmentTransactions)
        .values({
          id: row.id,
          accountId: row.accountId,
          plaidInvestmentTransactionId: row.plaidInvestmentTransactionId,
          securityName: row.securityName,
          ticker: row.ticker,
          type: row.type as "buy" | "sell" | "dividend" | "transfer" | "fee" | "other",
          quantity: row.quantity,
          price: row.price,
          amount: row.amount,
          fees: row.fees,
          date: row.date,
        })
        .onConflictDoNothing();
      if ((result.rowCount ?? 0) > 0) txnsInserted++;
    }

    for (const row of holdingRows) {
      await tx.insert(holdingsHistory)
        .values({
          id: uuid(),
          accountId: row.accountId,
          plaidSecurityId: row.plaidSecurityId,
          securityName: row.securityName,
          ticker: row.ticker,
          quantity: row.quantity,
          value: row.currentValue,
          date: today,
        })
        .onConflictDoNothing();
    }
  });

  return { holdingsUpserted, txnsInserted };
}

// ─── Snapshot Holdings (Daily Safety Net) ───────────────────────────────────

export async function snapshotHoldings(dbInstance: LedgrDb = defaultDb): Promise<void> {
  const today = todayDateString();
  const allHoldings = await dbInstance.select().from(investmentHoldings);

  for (const h of allHoldings) {
    await dbInstance
      .insert(holdingsHistory)
      .values({
        id: uuid(),
        accountId: h.accountId,
        plaidSecurityId: h.plaidSecurityId,
        securityName: h.securityName,
        ticker: h.ticker,
        quantity: h.quantity,
        value: h.currentValue,
        date: today,
      })
      .onConflictDoNothing();
  }
}
