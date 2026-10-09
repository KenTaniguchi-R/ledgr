import { inArray, and, eq, sql } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { accounts, bankConnections, institutionLogos, transactions, ACCOUNT_TYPES, type ConnectionStatus, type BankProvider } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted, countRows } from "@/lib/query-helpers";
import { classifyAccountType } from "@/lib/account-utils";

export async function getAccounts(householdId: string, db: LedgrDb = defaultDb) {
  const scoped = scopedQuery(householdId, db);
  const rows = await db
    .select()
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)));
  return rows.sort((a, b) => {
    const ai = ACCOUNT_TYPES.indexOf(a.type as (typeof ACCOUNT_TYPES)[number]);
    const bi = ACCOUNT_TYPES.indexOf(b.type as (typeof ACCOUNT_TYPES)[number]);
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}

export type AccountRow = Awaited<ReturnType<typeof getAccounts>>[number];

export interface InstitutionGroup {
  institutionName: string;
  connectionId: string | null;
  provider: BankProvider | null;
  status: ConnectionStatus | null;
  lastSyncedAt: Date | null;
  logoBase64: string | null;
  primaryColor: string | null;
  accounts: AccountRow[];
}

export async function getAccountsByInstitution(
  householdId: string,
  db: LedgrDb = defaultDb
): Promise<InstitutionGroup[]> {
  const allAccounts = await getAccounts(householdId, db);

  const scoped = scopedQuery(householdId, db);
  const items = await db
    .select()
    .from(bankConnections)
    .where(scoped.where(bankConnections));

  const itemMap = new Map(items.map((i) => [i.id, i]));

  const itemIds = items.map((i) => i.id);
  const logos = itemIds.length > 0
    ? await db
        .select({ connectionId: institutionLogos.connectionId, logo: institutionLogos.logo })
        .from(institutionLogos)
        .where(inArray(institutionLogos.connectionId, itemIds))
    : [];
  const logoMap = new Map(logos.map((l) => [l.connectionId, l.logo]));
  const groups = new Map<string, InstitutionGroup>();

  for (const account of allAccounts) {
    if (account.bankConnectionId) {
      const item = itemMap.get(account.bankConnectionId);
      const key = account.bankConnectionId;
      if (!groups.has(key)) {
        groups.set(key, {
          institutionName: item?.institutionName ?? "Unknown Institution",
          connectionId: account.bankConnectionId,
          provider: (item?.provider as InstitutionGroup["provider"]) ?? null,
          status: (item?.status as InstitutionGroup["status"]) ?? null,
          lastSyncedAt: item?.updatedAt ?? null,
          logoBase64: logoMap.get(account.bankConnectionId!) ?? null,
          primaryColor: item?.primaryColor ?? null,
          accounts: [],
        });
      }
      groups.get(key)!.accounts.push(account);
    } else {
      const key = "__manual__";
      if (!groups.has(key)) {
        groups.set(key, {
          institutionName: "Manual Accounts",
          connectionId: null,
          provider: null,
          status: null,
          lastSyncedAt: null,
          logoBase64: null,
          primaryColor: null,
          accounts: [],
        });
      }
      groups.get(key)!.accounts.push(account);
    }
  }

  const result = [...groups.values()];
  const manualIdx = result.findIndex((g) => g.connectionId === null);
  if (manualIdx > 0) {
    const [manual] = result.splice(manualIdx, 1);
    result.push(manual);
  }

  return result;
}

export async function getAccountsForImport(
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const scoped = scopedQuery(householdId, db);
  return await db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)));
}

export async function getAccountSummary(
  householdId: string,
  db: LedgrDb = defaultDb
) {
  const allAccounts = (await getAccounts(householdId, db)).filter(
    (a) => !a.isHidden
  );

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of allAccounts) {
    if (account.currentBalance === null) continue;
    if (classifyAccountType(account.type) === "asset") {
      totalAssets += account.currentBalance;
    } else {
      totalLiabilities += account.currentBalance;
    }
  }

  return {
    totalAssets,
    // Negative, because owed money is stored negative. Callers that display a
    // debt magnitude take Math.abs().
    totalLiabilities,
    // Plain sum, not `assets - liabilities`: the signs already carry the
    // direction. Subtracting a negative liability would ADD the debt.
    netWorth: totalAssets + totalLiabilities,
  };
}

export interface ReportFilterAccount {
  id: string;
  name: string;
  disconnected: boolean;
  txnCount: number;
  firstTxnDate: string | null;
  lastTxnDate: string | null;
}

/**
 * Accounts for the Reports filter bar — live accounts AND soft-deleted ones.
 *
 * Disconnecting an account leaves its transactions live and still counted in
 * every aggregate (see #87). Building the filter from `notDeleted(accounts)`
 * alone meant those transactions had no entry to filter by and no way to be
 * drilled into: silent inclusion with no control. The history is real spending,
 * so it stays in the totals; this query is what makes it visible and tickable.
 *
 * The per-account transaction span is what distinguishes a superseded account
 * from a duplicated one, so the popover can show that the old account stops
 * where its replacement begins.
 */
export async function getReportFilterAccounts(
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<ReportFilterAccount[]> {
  const scoped = scopedQuery(householdId, db);

  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      deletedAt: accounts.deletedAt,
      txnCount: countRows(),
      firstTxnDate: sql<string | null>`MIN(${transactions.date})`,
      lastTxnDate: sql<string | null>`MAX(${transactions.date})`,
    })
    .from(accounts)
    // LEFT JOIN so an account with no transactions still appears, and the
    // household predicate is repeated on the joined side: scopedQuery only
    // constrains the driving table.
    .leftJoin(
      transactions,
      and(
        eq(transactions.accountId, accounts.id),
        eq(transactions.householdId, householdId),
        notDeleted(transactions),
      ),
    )
    .where(scoped.where(accounts))
    .groupBy(accounts.id, accounts.name, accounts.deletedAt);

  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      disconnected: r.deletedAt !== null,
      // count(*) over a LEFT JOIN counts the null-filled row, so an account
      // with no transactions would report 1 rather than 0.
      txnCount: r.firstTxnDate === null ? 0 : Number(r.txnCount),
      firstTxnDate: r.firstTxnDate,
      lastTxnDate: r.lastTxnDate,
    }))
    .sort((a, b) => {
      // Live accounts first — the popover renders in this order, and a
      // disconnected account should never outrank one the user still holds.
      if (a.disconnected !== b.disconnected) return a.disconnected ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
}
