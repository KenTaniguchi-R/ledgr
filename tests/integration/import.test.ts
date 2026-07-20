import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./setup";
import type { LedgrDb } from "@/db";
import { transactions, accounts, households } from "@/db/schema";
import { v4 as uuid } from "uuid";
import { parsePreview, parseAll } from "@/lib/import/csv";
import { autoDetectMapping, validateMapping } from "@/lib/import/mapper";
import { normalizeImportedRows } from "@/lib/import/normalize";
import { findDuplicates } from "@/lib/import/dedup";
import { normalizeAmount } from "@/lib/money";

const CSV_CONTENT = `Date,Description,Amount
2024-01-15,Coffee Shop,-5.50
2024-01-16,Paycheck,2000.00
2024-01-17,Grocery Store,-45.99`;

describe("import pipeline integration", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;
  const householdId = "hh-1";
  const accountId = "acc-1";

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(households).values({ id: householdId, name: "Test" });
    await db.insert(accounts).values({
      id: accountId,
      householdId,
      name: "Checking",
      type: "checking",
      currency: "USD",
    });
  });

  afterEach(async () => {
    await close();
  });

  test("full CSV pipeline: parse → map → normalize → insert", async () => {
    const preview = parsePreview(CSV_CONTENT);
    expect(preview.headers).toEqual(["Date", "Description", "Amount"]);
    expect(preview.rows).toHaveLength(3);

    const detected = autoDetectMapping(preview.headers);
    const validated = validateMapping(detected);
    expect(validated.valid).toBe(true);
    if (!validated.valid) return;

    const rows = parseAll(CSV_CONTENT);
    const { rows: normalized } = normalizeImportedRows(
      rows,
      validated.mapping,
      accountId,
      householdId,
      "positive_is_expense"
    );
    expect(normalized).toHaveLength(3);
    expect(normalized[0].amount).toBe(-550);

    await db.transaction(async (tx) => {
      for (const row of normalized) {
        await tx.insert(transactions).values({
          id: row.id,
          accountId: row.accountId,
          householdId: row.householdId,
          date: row.date,
          originalName: row.originalName,
          name: row.name,
          amount: row.amount,
          normalizedAmount: normalizeAmount(row.amount, "checking"),
          externalId: row.externalId,
        });
      }
    });

    const inserted = await db.select().from(transactions);
    expect(inserted).toHaveLength(3);
  });

  test("dedup detects existing transactions", async () => {
    await db.insert(transactions).values({
      id: uuid(),
      accountId,
      householdId,
      date: "2024-01-15",
      originalName: "Coffee Shop",
      name: "Coffee Shop",
      amount: -550,
      normalizedAmount: 550,
    });

    const rows = parseAll(CSV_CONTENT);
    const detected = autoDetectMapping(["Date", "Description", "Amount"]);
    const validated = validateMapping(detected);
    if (!validated.valid) return;

    const { rows: normalized } = normalizeImportedRows(
      rows,
      validated.mapping,
      accountId,
      householdId,
      "positive_is_expense"
    );
    const { unique, duplicates } = await findDuplicates(normalized, accountId, db);
    expect(duplicates).toHaveLength(1);
    expect(unique).toHaveLength(2);
  });
});
