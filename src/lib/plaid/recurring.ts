import { v4 as uuid } from "uuid";
import { eq, and } from "drizzle-orm";
import { getPlaidClient } from "./client";
import {
  PlaidRecurringResponseSchema,
  type PlaidRecurringStream,
} from "./schemas";
import { plaidAmountToCents } from "@/lib/money";
import { nowISO } from "./utils";
import type { LedgrDb } from "@/db";
import { db as defaultDb } from "@/db";
import {
  recurringTransactions,
  transactions,
  accounts,
  merchants,
} from "@/db/schema";

const FREQUENCY_MAP: Record<string, string | null> = {
  WEEKLY: "weekly",
  BIWEEKLY: "biweekly",
  SEMI_MONTHLY: "semimonthly",
  MONTHLY: "monthly",
  ANNUALLY: "yearly",
  UNKNOWN: null,
};

function titleCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function syncRecurringTransactions(
  plaidItemId: string,
  householdId: string,
  accessToken: string,
  db: LedgrDb = defaultDb,
): Promise<{ upserted: number; deactivated: number }> {
  try {
    const client = getPlaidClient();

    const itemAccounts = db
      .select({ plaidAccountId: accounts.plaidAccountId, id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.householdId, householdId),
          eq(accounts.plaidItemId, plaidItemId),
        ),
      )
      .all();

    const accountIds = itemAccounts
      .map((a) => a.plaidAccountId)
      .filter((id): id is string => id !== null);

    const plaidToInternalAccount = new Map<string, string>();
    for (const a of itemAccounts) {
      if (a.plaidAccountId) plaidToInternalAccount.set(a.plaidAccountId, a.id);
    }

    const response = await client.transactionsRecurringGet({
      access_token: accessToken,
      account_ids: accountIds,
    });

    const parsed = PlaidRecurringResponseSchema.parse(response.data);

    const allStreams: Array<PlaidRecurringStream & { isIncome: boolean }> = [
      ...parsed.inflow_streams.map((s) => ({ ...s, isIncome: true })),
      ...parsed.outflow_streams.map((s) => ({ ...s, isIncome: false })),
    ];

    const now = nowISO();
    let upserted = 0;
    let deactivated = 0;

    const seenStreamIds = new Set<string>();

    db.transaction((tx) => {
      const existingMerchants = tx
        .select({ id: merchants.id, name: merchants.name })
        .from(merchants)
        .where(eq(merchants.householdId, householdId))
        .all();
      const merchantNameToId = new Map(
        existingMerchants.map((m) => [m.name, m.id]),
      );

      for (const stream of allStreams) {
        seenStreamIds.add(stream.stream_id);

        const merchantName = stream.merchant_name
          ? titleCase(stream.merchant_name)
          : null;

        let merchantId: string | null = null;
        if (merchantName) {
          merchantId = merchantNameToId.get(merchantName) ?? null;
          if (!merchantId) {
            merchantId = uuid();
            tx.insert(merchants)
              .values({
                id: merchantId,
                householdId,
                name: merchantName,
                rawNames: JSON.stringify([stream.merchant_name]),
                createdAt: now,
                updatedAt: now,
              })
              .run();
            merchantNameToId.set(merchantName, merchantId);
          }
        }

        const internalAccountId =
          plaidToInternalAccount.get(stream.account_id) ?? null;

        const frequency = FREQUENCY_MAP[stream.frequency] ?? null;
        const averageAmount = plaidAmountToCents(stream.average_amount.amount);
        const lastAmount = plaidAmountToCents(stream.last_amount.amount);
        const name = merchantName ?? titleCase(stream.description);

        const existing = tx
          .select({ id: recurringTransactions.id })
          .from(recurringTransactions)
          .where(eq(recurringTransactions.plaidStreamId, stream.stream_id))
          .get();

        if (existing) {
          tx.update(recurringTransactions)
            .set({
              name,
              merchantId,
              accountId: internalAccountId,
              averageAmount,
              lastAmount,
              frequency,
              lastDate: stream.last_date,
              nextDate: stream.predicted_next_date,
              isActive: stream.is_active,
              isIncome: stream.isIncome,
              updatedAt: now,
            })
            .where(eq(recurringTransactions.id, existing.id))
            .run();
        } else {
          tx.insert(recurringTransactions)
            .values({
              id: uuid(),
              householdId,
              plaidStreamId: stream.stream_id,
              accountId: internalAccountId,
              name,
              merchantId,
              averageAmount,
              lastAmount,
              frequency,
              lastDate: stream.last_date,
              nextDate: stream.predicted_next_date,
              isActive: stream.is_active,
              isIncome: stream.isIncome,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        }
        upserted++;

        if (stream.transaction_ids.length > 0) {
          const recurringRow = tx
            .select({ id: recurringTransactions.id })
            .from(recurringTransactions)
            .where(eq(recurringTransactions.plaidStreamId, stream.stream_id))
            .get();

          if (recurringRow) {
            for (const plaidTxnId of stream.transaction_ids) {
              tx.update(transactions)
                .set({
                  recurringTransactionId: recurringRow.id,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(transactions.plaidTransactionId, plaidTxnId),
                    eq(transactions.householdId, householdId),
                  ),
                )
                .run();
            }
          }
        }
      }

      const allExisting = tx
        .select({
          id: recurringTransactions.id,
          plaidStreamId: recurringTransactions.plaidStreamId,
        })
        .from(recurringTransactions)
        .where(
          and(
            eq(recurringTransactions.householdId, householdId),
            eq(recurringTransactions.isActive, true),
          ),
        )
        .all();

      for (const row of allExisting) {
        if (row.plaidStreamId && !seenStreamIds.has(row.plaidStreamId)) {
          tx.update(recurringTransactions)
            .set({ isActive: false, updatedAt: now })
            .where(eq(recurringTransactions.id, row.id))
            .run();
          deactivated++;
        }
      }
    });

    return { upserted, deactivated };
  } catch (err) {
    console.error(
      `[recurring] Failed to sync recurring for item ${plaidItemId}:`,
      err,
    );
    return { upserted: 0, deactivated: 0 };
  }
}
