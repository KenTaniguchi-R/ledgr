import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount, insertTransaction, insertCategoryGroup, insertCategory } from "./helpers";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => void;
let householdId: string;
let accountId: string;

beforeAll(() => {
  const testDb = createTestDb();
  db = testDb.db;
  close = testDb.close;

  ({ householdId } = insertHousehold(db));
  ({ accountId } = insertAccount(db, householdId, { name: "Checking" }));
  const { groupId } = insertCategoryGroup(db, householdId, { name: "Food" });
  const { categoryId } = insertCategory(db, householdId, groupId, { name: "Groceries" });

  insertTransaction(db, householdId, accountId, {
    date: "2026-03-15",
    normalizedAmount: 1250,
    amount: -1250,
    categoryId,
    name: "Test Store",
    originalName: "TEST STORE #123",
  });
  insertTransaction(db, householdId, accountId, {
    date: "2026-04-01",
    normalizedAmount: 2000,
    amount: -2000,
    categoryId,
    name: "Other Store",
    originalName: "OTHER STORE",
  });
});

afterAll(() => close());

describe("buildCsvString", () => {
  test("exports amounts as negated dollars", async () => {
    const { buildCsvString } = await import("../../src/app/api/export/transactions/route");
    const csv = buildCsvString(householdId, {}, db);
    const lines = csv.split("\n");
    // Header + 2 data rows + trailing newline
    expect(lines[0]).toBe("Date,Account,Merchant,Amount,Category,Category Group,Notes,Original Description");
    // $12.50 expense (normalizedAmount=1250) → -12.50
    const row1 = lines.find((l) => l.includes("Test Store"));
    expect(row1).toContain("-12.50");
  });

  test("respects date range filter", async () => {
    const { buildCsvString } = await import("../../src/app/api/export/transactions/route");
    const csv = buildCsvString(householdId, { from: "2026-03-01", to: "2026-03-31" }, db);
    const lines = csv.split("\n").filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(2); // header + 1 row in March
  });

  test("UTF-8 BOM present", async () => {
    const { buildCsvResponse } = await import("../../src/app/api/export/transactions/route");

    const response = buildCsvResponse(householdId, {}, db);
    const buffer = Buffer.from(await response.arrayBuffer());
    expect(buffer[0]).toBe(0xef);
    expect(buffer[1]).toBe(0xbb);
    expect(buffer[2]).toBe(0xbf);
  });
});
