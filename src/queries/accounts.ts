import { inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { accounts, bankConnections, institutionLogos, ACCOUNT_TYPES, type ConnectionStatus, type BankProvider } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
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
