import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertRecurringTransaction,
} from "./helpers";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  await close();
});

describe("getUpcomingBills", () => {
  it("returns active outflows sorted by nextDate", async () => {
    const { householdId } = await insertHousehold(db);

    await insertRecurringTransaction(db, householdId, {
      name: "Netflix",
      nextDate: "2026-05-15",
      isActive: true,
      isIncome: false,
      averageAmount: 1599,
      frequency: "monthly",
    });
    await insertRecurringTransaction(db, householdId, {
      name: "Gym",
      nextDate: "2026-05-10",
      isActive: true,
      isIncome: false,
      averageAmount: 2500,
      frequency: "monthly",
    });
    await insertRecurringTransaction(db, householdId, {
      name: "Salary",
      nextDate: "2026-05-01",
      isActive: true,
      isIncome: true,
      averageAmount: -300000,
      frequency: "monthly",
    });
    await insertRecurringTransaction(db, householdId, {
      name: "Old Service",
      nextDate: "2026-05-01",
      isActive: false,
      isIncome: false,
    });

    const { getUpcomingBills } = await import("../../src/queries/recurring");
    const bills = await getUpcomingBills(householdId, {}, db);

    expect(bills).toHaveLength(2);
    expect(bills[0].name).toBe("Gym");
    expect(bills[1].name).toBe("Netflix");
  });

  it("filters by search term", async () => {
    const { householdId } = await insertHousehold(db);

    await insertRecurringTransaction(db, householdId, {
      name: "Netflix",
      nextDate: "2026-05-15",
      isActive: true,
      isIncome: false,
    });
    await insertRecurringTransaction(db, householdId, {
      name: "Gym",
      nextDate: "2026-05-10",
      isActive: true,
      isIncome: false,
    });

    const { getUpcomingBills } = await import("../../src/queries/recurring");
    const bills = await getUpcomingBills(householdId, { search: "net" }, db);

    expect(bills).toHaveLength(1);
    expect(bills[0].name).toBe("Netflix");
  });
});

describe("getRecurringSummary", () => {
  it("normalizes amounts to monthly using exact fractions", async () => {
    const { householdId } = await insertHousehold(db);

    await insertRecurringTransaction(db, householdId, {
      name: "Weekly Coffee",
      averageAmount: 1000,
      frequency: "weekly",
      isActive: true,
      isIncome: false,
    });
    await insertRecurringTransaction(db, householdId, {
      name: "Salary",
      averageAmount: 300000,
      frequency: "monthly",
      isActive: true,
      isIncome: true,
    });
    await insertRecurringTransaction(db, householdId, {
      name: "Annual Sub",
      averageAmount: 12000,
      frequency: "yearly",
      isActive: true,
      isIncome: false,
    });

    const { getRecurringSummary } = await import("../../src/queries/recurring");
    const summary = await getRecurringSummary(householdId, db);

    expect(summary.monthlyIncome).toBe(300000);
    expect(summary.monthlyExpenses).toBe(Math.round(1000 * (52 / 12)) + 1000);
  });
});
