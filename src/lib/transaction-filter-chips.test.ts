import { describe, expect, it } from "vitest";
import {
  buildFilterChips,
  describeAmountFilter,
  describeCategoryFilter,
  describeDateFilter,
  type ChipInput,
} from "./transaction-filter-chips";
import { dateRangeForPreset } from "./date-presets";
import type { CategoryGroup } from "@/queries/categories";

const CATEGORIES: CategoryGroup[] = [
  {
    id: "g1",
    name: "Food",
    categories: [
      { id: "c1", name: "Groceries", icon: "🛒" },
      { id: "c2", name: "Restaurants", icon: null },
    ],
  },
] as unknown as CategoryGroup[];

const ACCOUNTS = [
  { id: "a1", name: "Checking-1135" },
  { id: "a2", name: "Robinhood individual (1722)" },
];

/** A no-filters-applied baseline each test narrows from. */
const EMPTY: ChipInput = {
  from: null,
  to: null,
  accountId: null,
  categoryId: null,
  typeId: null,
  amountMinDisplay: "",
  amountMaxDisplay: "",
  reviewed: false,
  accounts: ACCOUNTS,
  categories: CATEGORIES,
};

describe("describeDateFilter", () => {
  it("names the preset when the range matches one", () => {
    const { from, to } = dateRangeForPreset("30d");
    expect(describeDateFilter(from, to)).toBe("Last 30 days");
  });

  it("renders both endpoints for a custom range", () => {
    expect(describeDateFilter("2026-03-04", "2026-04-09")).toBe("Mar 4 - Apr 9");
  });

  it("renders an open-ended range from one endpoint", () => {
    expect(describeDateFilter("2026-03-04", null)).toBe("From Mar 4");
    expect(describeDateFilter(null, "2026-04-09")).toBe("Until Apr 9");
  });

  it("is null when no date filter is applied", () => {
    expect(describeDateFilter(null, null)).toBeNull();
  });
});

describe("describeCategoryFilter", () => {
  it("resolves an id nested inside a group", () => {
    expect(describeCategoryFilter("c2", CATEGORIES)).toBe("Restaurants");
  });

  it("names the uncategorized pseudo-filter", () => {
    expect(describeCategoryFilter("uncategorized", CATEGORIES)).toBe("Uncategorized");
  });

  it("is null for an id that resolves to no category", () => {
    expect(describeCategoryFilter("gone", CATEGORIES)).toBeNull();
  });
});

describe("describeAmountFilter", () => {
  it("renders a bounded range, and each half-open bound", () => {
    expect(describeAmountFilter("10", "50")).toBe("$10 - $50");
    expect(describeAmountFilter("10", "")).toBe("≥ $10");
    expect(describeAmountFilter("", "50")).toBe("≤ $50");
  });

  it("is null when neither bound is set", () => {
    expect(describeAmountFilter("", "")).toBeNull();
  });
});

describe("buildFilterChips", () => {
  it("is empty when nothing is applied", () => {
    expect(buildFilterChips(EMPTY)).toEqual([]);
  });

  it("carries a label and value per applied filter", () => {
    const chips = buildFilterChips({
      ...EMPTY,
      accountId: "a2",
      categoryId: "c1",
    });
    expect(chips).toEqual([
      { key: "account", label: "Account", value: "Robinhood individual (1722)" },
      { key: "category", label: "Category", value: "Groceries" },
    ]);
  });

  it("gives the type chip no label — its value already names the filter", () => {
    expect(buildFilterChips({ ...EMPTY, typeId: "expense" })).toEqual([
      { key: "type", label: null, value: "Expenses" },
    ]);
  });

  it("skips filters whose value cannot be resolved", () => {
    // A stale account id in the URL must not produce a chip with no value —
    // an "Account:" chip naming nothing is worse than no chip at all.
    expect(buildFilterChips({ ...EMPTY, accountId: "deleted" })).toEqual([]);
  });

  it("counts the reviewed toggle, which has no value of its own", () => {
    expect(buildFilterChips({ ...EMPTY, reviewed: true })).toEqual([
      { key: "reviewed", label: null, value: "Reviewed" },
    ]);
  });

  it("orders chips the same way the filter controls are ordered", () => {
    const chips = buildFilterChips({
      ...EMPTY,
      from: "2026-03-04",
      to: "2026-04-09",
      accountId: "a1",
      categoryId: "c1",
      typeId: "credits",
      amountMinDisplay: "10",
      reviewed: true,
    });
    expect(chips.map((c) => c.key)).toEqual([
      "date",
      "account",
      "category",
      "type",
      "amount",
      "reviewed",
    ]);
  });
});
