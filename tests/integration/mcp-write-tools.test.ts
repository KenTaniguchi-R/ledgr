import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import {
  insertHousehold,
  insertAccount,
  insertTransaction,
  insertCategoryGroup,
  insertCategory,
} from "./helpers";
import { transactions } from "../../src/db/schema";
import type { LedgrDb } from "../../src/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/demo-mode", () => ({ guardDemoMode: vi.fn(() => null) }));

describe("updateTransactionCategoryScoped", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  let householdA: string;
  let aCategoryId: string;
  let bTransactionId: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());

    const hhA = await insertHousehold(db, "Household A");
    householdA = hhA.householdId;
    const { groupId: groupA } = await insertCategoryGroup(db, householdA);
    ({ categoryId: aCategoryId } = await insertCategory(db, householdA, groupA, { name: "A Category" }));

    const hhB = await insertHousehold(db, "Household B");
    const { accountId: bAccountId } = await insertAccount(db, hhB.householdId);
    ({ transactionId: bTransactionId } = await insertTransaction(db, hhB.householdId, bAccountId));
  });

  afterAll(async () => {
    await close();
  });

  it("rejects a foreign transaction", async () => {
    const { updateTransactionCategoryScoped } = await import("../../src/actions/transactions");
    const res = await updateTransactionCategoryScoped(householdA, bTransactionId, aCategoryId, db);
    expect(res).toEqual({ error: "Transaction not found" });

    const [row] = await db.select().from(transactions).where(eq(transactions.id, bTransactionId));
    expect(row!.categoryId).toBeNull();
  });

  it("accepts a transaction owned by the caller's household", async () => {
    const { updateTransactionCategoryScoped } = await import("../../src/actions/transactions");
    const { accountId } = await insertAccount(db, householdA);
    const { transactionId } = await insertTransaction(db, householdA, accountId);

    const res = await updateTransactionCategoryScoped(householdA, transactionId, aCategoryId, db);
    expect(res).toEqual({ success: true });

    const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
    expect(row!.categoryId).toBe(aCategoryId);
  });
});
