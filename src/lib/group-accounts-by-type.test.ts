import { describe, it, expect } from "vitest";
import { groupAccountsByType, type GroupableAccount } from "./group-accounts-by-type";
import type { AccountType } from "@/db/schema/accounts";

function acct(
  id: string,
  type: AccountType,
  currentBalance: number | null,
  extra: Partial<GroupableAccount> = {},
): GroupableAccount {
  return {
    id,
    name: id,
    type,
    currentBalance,
    isHidden: false,
    institutionName: "Bank",
    ...extra,
  };
}

describe("groupAccountsByType", () => {
  it("returns groups in a fixed order regardless of input order", () => {
    const groups = groupAccountsByType([
      acct("card", "credit", -1000),
      acct("brokerage", "investment", 5000),
      acct("chk", "checking", 2000),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["cash", "investment", "credit"]);
  });

  it("omits groups with no accounts rather than rendering empty sections", () => {
    const groups = groupAccountsByType([acct("chk", "checking", 100)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("cash");
  });

  it("returns nothing for no accounts", () => {
    expect(groupAccountsByType([])).toEqual([]);
  });

  it("sums each group's subtotal", () => {
    const groups = groupAccountsByType([
      acct("chk1", "checking", 2000),
      acct("chk2", "checking", 500),
      acct("card", "credit", -1000),
    ]);
    expect(groups.find((g) => g.key === "cash")!.subtotal).toBe(2500);
    expect(groups.find((g) => g.key === "credit")!.subtotal).toBe(-1000);
  });

  it("treats a null balance as zero in the subtotal but still lists the account", () => {
    // A manual account with no balance yet should not vanish from the list.
    const groups = groupAccountsByType([acct("chk", "checking", null), acct("chk2", "checking", 300)]);
    expect(groups[0].subtotal).toBe(300);
    expect(groups[0].accounts).toHaveLength(2);
  });

  it("excludes hidden accounts entirely", () => {
    // getAccountSummary filters hidden accounts before totalling, so including
    // them here would make the group subtotals disagree with the page header.
    const groups = groupAccountsByType([
      acct("visible", "checking", 1000),
      acct("hidden", "checking", 9999, { isHidden: true }),
    ]);
    expect(groups[0].accounts.map((a) => a.id)).toEqual(["visible"]);
    expect(groups[0].subtotal).toBe(1000);
  });

  it("sorts accounts within a group by balance, largest first", () => {
    const groups = groupAccountsByType([
      acct("small", "checking", 100),
      acct("big", "checking", 5000),
      acct("mid", "checking", 900),
    ]);
    expect(groups[0].accounts.map((a) => a.id)).toEqual(["big", "mid", "small"]);
  });

  it("sorts debts by size of debt, largest first", () => {
    // Liabilities are negative, so a naive descending sort would put the
    // smallest debt at the top. Largest obligation should lead.
    const groups = groupAccountsByType([
      acct("small", "credit", -100),
      acct("big", "credit", -5000),
    ]);
    expect(groups[0].accounts.map((a) => a.id)).toEqual(["big", "small"]);
  });

  describe("subtotals reconcile to the page header", () => {
    // The header states Assets / Debts / Net Worth. If the groups do not foot
    // to those figures the page contradicts itself, which is the whole reason
    // this grouping exists.
    const accounts = [
      acct("chk", "checking", 119520),
      acct("sav", "savings", 50000),
      acct("brk", "investment", 3838538),
      acct("card1", "credit", -320534),
      acct("card2", "credit", -104893),
      acct("loan", "loan", -1500000),
      acct("hidden", "checking", 999999, { isHidden: true }),
    ];

    it("assets sum to the sum of asset-group subtotals", () => {
      const groups = groupAccountsByType(accounts);
      const assets = groups.filter((g) => g.side === "asset").reduce((s, g) => s + g.subtotal, 0);
      expect(assets).toBe(119520 + 50000 + 3838538);
    });

    it("debts sum to the sum of liability-group subtotals", () => {
      const groups = groupAccountsByType(accounts);
      const debts = groups.filter((g) => g.side === "liability").reduce((s, g) => s + g.subtotal, 0);
      expect(debts).toBe(-320534 - 104893 - 1500000);
    });

    it("all subtotals together equal net worth", () => {
      const groups = groupAccountsByType(accounts);
      const net = groups.reduce((s, g) => s + g.subtotal, 0);
      expect(net).toBe(119520 + 50000 + 3838538 - 320534 - 104893 - 1500000);
    });
  });

  it("labels each group and marks which side of the balance sheet it is on", () => {
    const groups = groupAccountsByType([acct("chk", "checking", 1), acct("card", "credit", -1)]);
    expect(groups.find((g) => g.key === "cash")).toMatchObject({ label: "Cash", side: "asset" });
    expect(groups.find((g) => g.key === "credit")).toMatchObject({
      label: "Credit cards",
      side: "liability",
    });
  });

  it("folds savings in with checking under Cash", () => {
    // Users think of these as one pool; splitting them makes the page longer
    // without answering a question anyone asked.
    const groups = groupAccountsByType([acct("chk", "checking", 100), acct("sav", "savings", 200)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].subtotal).toBe(300);
  });
});
