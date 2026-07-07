import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount, insertTransaction } from "./helpers";
import { transactions } from "../../src/db/schema";
import { backfillCleanTransactionNames } from "../../src/lib/jobs/backfill-clean-names";
import type { LedgrDb } from "../../src/db";

let db: LedgrDb;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  await close();
});

const RAW = "ACH ELECTRONIC DEBIT May11 05:25a 0000 CHASE CREDIT CRD AUTOPAY";

describe("backfillCleanTransactionNames", () => {
  it("re-derives name from originalName for untouched raw rows", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId);
    const { transactionId } = await insertTransaction(db, householdId, accountId, {
      name: RAW,
      originalName: RAW,
    });

    const result = await backfillCleanTransactionNames(db);

    const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
    expect(row.name).toBe("Chase Credit CRD Autopay");
    expect(row.originalName).toBe(RAW); // raw is always preserved
    expect(result.updated).toBe(1);
  });

  it("never overwrites a name that was edited away from originalName", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId);
    const { transactionId } = await insertTransaction(db, householdId, accountId, {
      name: "Rent — Landlord",
      originalName: RAW,
    });

    const result = await backfillCleanTransactionNames(db);

    const [row] = await db.select().from(transactions).where(eq(transactions.id, transactionId));
    expect(row.name).toBe("Rent — Landlord");
    expect(result.updated).toBe(0);
  });

  it("leaves already-clean names unchanged and does not count them", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId } = await insertAccount(db, householdId);
    await insertTransaction(db, householdId, accountId, { name: "Amazon", originalName: "Amazon" });

    const result = await backfillCleanTransactionNames(db);

    expect(result.updated).toBe(0);
  });
});
