import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { accounts, plaidItems } from "@/db/schema";
import { scopedQuery } from "@/lib/scoped-query";
import { notDeleted } from "@/lib/query-helpers";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

type LedgrDb = BetterSQLite3Database<typeof schema>;

const TYPE_ORDER = ["checking", "savings", "credit", "loan", "investment", "other"] as const;

export function getAccounts(householdId: string, db: LedgrDb = defaultDb) {
  const scoped = scopedQuery(householdId, db);
  return db
    .select()
    .from(accounts)
    .where(scoped.where(accounts, notDeleted(accounts)))
    .all()
    .sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type as (typeof TYPE_ORDER)[number]);
      const bi = TYPE_ORDER.indexOf(b.type as (typeof TYPE_ORDER)[number]);
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
}

export type AccountRow = ReturnType<typeof getAccounts>[number];

export interface InstitutionGroup {
  institutionName: string;
  plaidItemId: string | null;
  status: "active" | "error" | "reauth_required" | null;
  accounts: AccountRow[];
}

export function getAccountsByInstitution(
  householdId: string,
  db: LedgrDb = defaultDb
): InstitutionGroup[] {
  const allAccounts = getAccounts(householdId, db);

  const items = db
    .select()
    .from(plaidItems)
    .where(eq(plaidItems.householdId, householdId))
    .all();

  const itemMap = new Map(items.map((i) => [i.id, i]));
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

const ASSET_TYPES = new Set(["checking", "savings", "investment"]);
const LIABILITY_TYPES = new Set(["credit", "loan"]);

export function getAccountSummary(
  householdId: string,
  db: LedgrDb = defaultDb
) {
  const allAccounts = getAccounts(householdId, db).filter(
    (a) => !a.isHidden
  );

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const account of allAccounts) {
    if (account.currentBalance === null) continue;
    if (ASSET_TYPES.has(account.type)) {
      totalAssets += account.currentBalance;
    } else if (LIABILITY_TYPES.has(account.type)) {
      totalLiabilities += account.currentBalance;
    }
  }

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}
