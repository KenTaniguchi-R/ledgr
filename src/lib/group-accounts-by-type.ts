import type { AccountType } from "@/db/schema/accounts";
import { classifyAccountType } from "@/lib/account-utils";

/**
 * Regroups accounts by what they are rather than who holds them.
 *
 * The Accounts page header states Assets / Debts / Net Worth, but the list
 * beneath it is organised by institution — so a bank holding both a current
 * account and a credit card sums to a group total that means nothing, and the
 * debts are scattered across separate cards. Grouping by type gives every
 * subtotal a meaning and lets them foot to the header.
 *
 * Hidden accounts are dropped here because `getAccountSummary` drops them
 * before totalling; including them would make the groups disagree with the
 * figures printed directly above them.
 */

export interface GroupableAccount {
  id: string;
  name: string;
  type: AccountType;
  currentBalance: number | null;
  isHidden: boolean | null;
  institutionName: string;
}

export type AccountGroupKey = "cash" | "investment" | "credit" | "loan" | "other";

export interface AccountTypeGroup<T extends GroupableAccount = GroupableAccount> {
  key: AccountGroupKey;
  label: string;
  side: "asset" | "liability";
  subtotal: number;
  accounts: T[];
}

/** Checking and savings read as one pool of spendable money, so they share a group. */
const GROUP_OF: Record<AccountType, AccountGroupKey> = {
  checking: "cash",
  savings: "cash",
  investment: "investment",
  credit: "credit",
  loan: "loan",
  other: "other",
};

/** Assets first, then debts — the order the header states them in. */
const GROUP_ORDER: { key: AccountGroupKey; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "investment", label: "Investments" },
  { key: "other", label: "Other assets" },
  { key: "credit", label: "Credit cards" },
  { key: "loan", label: "Loans" },
];

/** One representative type per group, enough to ask which side of the sheet it is on. */
const REPRESENTATIVE_TYPE: Record<AccountGroupKey, AccountType> = {
  cash: "checking",
  investment: "investment",
  credit: "credit",
  loan: "loan",
  other: "other",
};

export function groupAccountsByType<T extends GroupableAccount>(
  accounts: T[],
): AccountTypeGroup<T>[] {
  const buckets = new Map<AccountGroupKey, T[]>();

  for (const account of accounts) {
    if (account.isHidden) continue;
    const key = GROUP_OF[account.type] ?? "other";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(account);
    else buckets.set(key, [account]);
  }

  const groups: AccountTypeGroup<T>[] = [];

  for (const { key, label } of GROUP_ORDER) {
    const bucket = buckets.get(key);
    // An empty section is noise — a household with no loans should not be told
    // it has no loans on every visit. A missing key is the only empty case: a
    // bucket is created by its first push, so it is never present-but-empty.
    if (!bucket) continue;

    const side = classifyAccountType(REPRESENTATIVE_TYPE[key]);

    groups.push({
      key,
      label,
      side,
      subtotal: bucket.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0),
      // Sorted by magnitude so the largest holding — or the largest debt, which
      // is the most negative number — leads its group.
      accounts: [...bucket].sort(
        (a, b) => Math.abs(b.currentBalance ?? 0) - Math.abs(a.currentBalance ?? 0),
      ),
    });
  }

  return groups;
}
