import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { insertHousehold, insertCategoryGroup, insertCategory } from "./helpers";
import {
  updateRecurringTransaction,
  deleteRecurringTransaction,
} from "../../src/actions/recurring";
import { getUpcomingBills, getRecurringSummary } from "../../src/queries/recurring";
import { recurringTransactions } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { LedgrDb } from "../../src/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/demo-mode", () => ({ guardDemoMode: vi.fn(() => null) }));

const mockUserId = "test-user-id";
let mockHouseholdId: string;
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
  getSession: vi.fn(() => Promise.resolve({ user: { id: mockUserId } })),
}));

describe("recurring transaction actions", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let categoryId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    const hh = await insertHousehold(db);
    mockHouseholdId = hh.householdId;
    const { groupId } = await insertCategoryGroup(db, hh.householdId);
    ({ categoryId } = await insertCategory(db, hh.householdId, groupId, { name: "Subscriptions" }));
  });

  afterAll(async () => {
    await close();
  });

  async function insertBill(
    householdId: string,
    overrides: Partial<typeof recurringTransactions.$inferInsert> = {},
  ) {
    const id = uuid();
    await db.insert(recurringTransactions).values({
      id,
      householdId,
      name: "Twitterapi.io",
      averageAmount: 1333,
      lastAmount: 1333,
      frequency: "monthly",
      lastDate: "2026-08-01",
      nextDate: "2026-09-01",
      isActive: true,
      isIncome: false,
      ...overrides,
    });
    return id;
  }

  describe("updateRecurringTransaction", () => {
    it("updates name, category, amount and frequency together", async () => {
      const id = await insertBill(mockHouseholdId);

      const result = await updateRecurringTransaction(
        {
          id,
          name: "Twitter API",
          categoryId,
          averageAmount: 1500,
          frequency: "yearly",
          isActive: true,
        },
        db,
      );

      expect(result).toMatchObject({ success: true });
      const [row] = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, id));
      expect(row!.name).toBe("Twitter API");
      expect(row!.categoryId).toBe(categoryId);
      expect(row!.averageAmount).toBe(1500);
      expect(row!.frequency).toBe("yearly");
    });

    it("trims the name and rejects one that is only whitespace", async () => {
      const id = await insertBill(mockHouseholdId);

      const ok = await updateRecurringTransaction(
        { id, name: "  Spotify  ", categoryId: null, averageAmount: 1333, frequency: "monthly", isActive: true },
        db,
      );
      expect(ok).toMatchObject({ success: true });
      const [row] = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, id));
      expect(row!.name).toBe("Spotify");

      const bad = await updateRecurringTransaction(
        { id, name: "   ", categoryId: null, averageAmount: 1333, frequency: "monthly", isActive: true },
        db,
      );
      expect(bad).toMatchObject({ error: expect.any(String) });
    });

    it("rejects a negative amount", async () => {
      // averageAmount is displayed via Math.abs, so a negative would render
      // identically while corrupting the monthly total's sign handling.
      const id = await insertBill(mockHouseholdId);

      const result = await updateRecurringTransaction(
        { id, name: "Twitterapi.io", categoryId: null, averageAmount: -500, frequency: "monthly", isActive: true },
        db,
      );

      expect(result).toMatchObject({ error: expect.any(String) });
    });

    it("clears the category when passed null", async () => {
      const id = await insertBill(mockHouseholdId, { categoryId });

      await updateRecurringTransaction(
        { id, name: "Twitterapi.io", categoryId: null, averageAmount: 1333, frequency: "monthly", isActive: true },
        db,
      );

      const [row] = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, id));
      expect(row!.categoryId).toBeNull();
    });

    it("rejects a category belonging to another household", async () => {
      const id = await insertBill(mockHouseholdId);
      const other = await insertHousehold(db);
      const { groupId } = await insertCategoryGroup(db, other.householdId);
      const foreign = await insertCategory(db, other.householdId, groupId, { name: "Foreign" });

      const result = await updateRecurringTransaction(
        {
          id,
          name: "Twitterapi.io",
          categoryId: foreign.categoryId,
          averageAmount: 1333,
          frequency: "monthly",
          isActive: true,
        },
        db,
      );

      expect(result).toMatchObject({ error: expect.any(String) });
      const [row] = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, id));
      expect(row!.categoryId).toBeNull();
    });

    it("will not update a bill belonging to another household", async () => {
      const other = await insertHousehold(db);
      const foreignId = await insertBill(other.householdId, { name: "Theirs" });

      const result = await updateRecurringTransaction(
        { id: foreignId, name: "Hijacked", categoryId: null, averageAmount: 1, frequency: "monthly", isActive: true },
        db,
      );

      expect(result).toMatchObject({ error: expect.any(String) });
      const [row] = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, foreignId));
      expect(row!.name).toBe("Theirs");
    });
  });

  describe("muting", () => {
    it("drops a muted bill from the list and the monthly total", async () => {
      const hh = await insertHousehold(db);
      mockHouseholdId = hh.householdId;
      const id = await insertBill(hh.householdId, { averageAmount: 5000, frequency: "monthly" });

      const before = await getRecurringSummary(hh.householdId, db);
      expect(before.monthlyExpenses).toBe(5000);
      expect(await getUpcomingBills(hh.householdId, {}, db)).toHaveLength(1);

      await updateRecurringTransaction(
        { id, name: "Twitterapi.io", categoryId: null, averageAmount: 5000, frequency: "monthly", isActive: false },
        db,
      );

      // The record survives -- a later sync must not re-detect it as new --
      // but it stops counting as a recurring expense.
      const after = await getRecurringSummary(hh.householdId, db);
      expect(after.monthlyExpenses).toBe(0);
      expect(await getUpcomingBills(hh.householdId, {}, db)).toHaveLength(0);
      const [row] = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, id));
      expect(row).toBeDefined();
      expect(row!.isActive).toBe(false);
    });
  });

  describe("deleteRecurringTransaction", () => {
    it("removes the bill", async () => {
      const hh = await insertHousehold(db);
      mockHouseholdId = hh.householdId;
      const id = await insertBill(hh.householdId);

      const result = await deleteRecurringTransaction(id, db);

      expect(result).toMatchObject({ success: true });
      const rows = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, id));
      expect(rows).toHaveLength(0);
    });

    it("will not delete a bill belonging to another household", async () => {
      const hh = await insertHousehold(db);
      mockHouseholdId = hh.householdId;
      const other = await insertHousehold(db);
      const foreignId = await insertBill(other.householdId, { name: "Survives" });

      const result = await deleteRecurringTransaction(foreignId, db);

      expect(result).toMatchObject({ error: expect.any(String) });
      const rows = await db
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, foreignId));
      expect(rows).toHaveLength(1);
    });
  });
});
