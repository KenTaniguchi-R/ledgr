import { inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { accounts, plaidItems, institutionLogos, ACCOUNT_TYPES, type PlaidItemStatus } from "@/db/schema";
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
  plaidItemId: string | null;
  status: PlaidItemStatus | null;
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
    .from(plaidItems)
    .where(scoped.where(plaidItems));

  const itemMap = new Map(items.map((i) => [i.id, i]));

  const itemIds = items.map((i) => i.id);
  const logos = itemIds.length > 0
    ? await db
        .select({ plaidItemId: institutionLogos.plaidItemId, logo: institutionLogos.logo })
        .from(institutionLogos)
        .where(inArray(institutionLogos.plaidItemId, itemIds))
    : [];
  const logoMap = new Map(logos.map((l) => [l.plaidItemId, l.logo]));
  const groups = new Map<string, InstitutionGroup>();

  for (const account of allAccounts) {
    if (account.plaidItemId) {
      const item = itemMap.get(account.plaidItemId);
      const key = account.plaidItemId;
      if (!groups.has(key)) {
        groups.set(key, {
          institutionName: item?.institutionName ?? "Unknown Institution",
          plaidItemId: account.plaidItemId,
          status: (item?.status as InstitutionGroup["status"]) ?? null,
          lastSyncedAt: item?.updatedAt ?? null,
          logoBase64: logoMap.get(account.plaidItemId!) ?? null,
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
          plaidItemId: null,
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
  const manualIdx = result.findIndex((g) => g.plaidItemId === null);
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
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}
