import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import {
  households,
  householdMembers,
  categoryGroups,
  categories,
  bankConnections,
  accounts,
  transactions,
} from "@/db/schema";
import type { LedgrDb } from "@/db";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: vi.fn() };
});

const { generateText } = await import("ai");
const { categorizeWithAi } = await import("@/lib/ai/categorize");

const HOUSEHOLD_ID = "hh-ai-categorize-retry";
const CATEGORY_ID = "cat-groceries";
const CONNECTION_ID = "conn-sfin";
const ACCOUNT_ID = "acc-sfin";

function mockAssignments(assignments: unknown[]) {
  vi.mocked(generateText).mockResolvedValue({
    output: { assignments },
  } as never);
}

describe("categorizeWithAi retry semantics", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(() => {
    vi.stubEnv("AI_PROVIDER", "google");
    vi.stubEnv("AI_MODEL", "test-model");
    vi.stubEnv("AI_API_KEY", "test-key");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.mocked(generateText).mockReset();
  });

  async function setup() {
    ({ db, close } = await createTestDb());
    const now = new Date();

    await db.insert(households).values({ id: HOUSEHOLD_ID, name: "Test", createdAt: now, updatedAt: now });
    await db.insert(householdMembers).values({ id: uuid(), householdId: HOUSEHOLD_ID, userId: "user-1", role: "owner", createdAt: now });
    await db.insert(categoryGroups).values({ id: "grp-food", householdId: HOUSEHOLD_ID, name: "Food & Drink" });
    await db.insert(categories).values({ id: CATEGORY_ID, householdId: HOUSEHOLD_ID, groupId: "grp-food", name: "Groceries" });
    await db.insert(bankConnections).values({
      id: CONNECTION_ID,
      householdId: HOUSEHOLD_ID,
      provider: "simplefin",
      credential: "encrypted-cred",
      institutionName: "Robinhood",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(accounts).values({
      id: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
      bankConnectionId: CONNECTION_ID,
      externalAccountId: "sfin-acc-1",
      name: "Robinhood Credit Card",
      type: "credit",
      createdAt: now,
      updatedAt: now,
    });
  }

  async function insertTxn(id: string, name: string) {
    await db.insert(transactions).values({
      id,
      accountId: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
      date: "2026-08-28",
      originalName: name,
      name,
      amount: 1250,
      normalizedAmount: -1250,
    });
  }

  async function read(id: string) {
    const [row] = await db.select().from(transactions).where(eq(transactions.id, id));
    return row;
  }

  it("leaves a thrown batch unstamped so the next sync retries it", async () => {
    // Regression: the attempt stamp used to be written unconditionally, so a
    // single transient provider error permanently retired the batch — the
    // uncategorized scan filters on aiCategorizationAttemptedAt IS NULL.
    await setup();
    await insertTxn("txn-1", "Seven-Eleven");

    vi.mocked(generateText).mockRejectedValue(new Error("503 upstream unavailable"));
    const first = await categorizeWithAi(HOUSEHOLD_ID, db);
    expect(first.categorized).toBe(0);

    const afterFailure = await read("txn-1");
    expect(afterFailure.aiCategorizationAttemptedAt).toBeNull();
    expect(afterFailure.categoryId).toBeNull();

    mockAssignments([{ transactionId: "txn-1", categoryId: CATEGORY_ID, confidence: 0.95 }]);
    const second = await categorizeWithAi(HOUSEHOLD_ID, db);
    expect(second.categorized).toBe(1);

    const afterRetry = await read("txn-1");
    expect(afterRetry.categoryId).toBe(CATEGORY_ID);
    expect(afterRetry.categorySource).toBe("ai");

    await close();
  });

  it("applies a low-confidence pick instead of discarding it", async () => {
    // An uncategorized row costs an edit either way, so the closest guess is
    // strictly better than leaving it blank — it is just filed under its own
    // provenance. Previously anything under the threshold was thrown away.
    await setup();
    await insertTxn("txn-2", "Shoyukai");

    mockAssignments([{ transactionId: "txn-2", categoryId: CATEGORY_ID, confidence: 0.2 }]);
    const result = await categorizeWithAi(HOUSEHOLD_ID, db);
    expect(result).toMatchObject({ categorized: 1, lowConfidence: 1 });

    const row = await read("txn-2");
    expect(row.categoryId).toBe(CATEGORY_ID);
    expect(row.categorySource).toBe("ai_low_confidence");

    await close();
  });

  it("files a confident pick as plain ai", async () => {
    await setup();
    await insertTxn("txn-2b", "Safeway");

    mockAssignments([{ transactionId: "txn-2b", categoryId: CATEGORY_ID, confidence: 0.93 }]);
    const result = await categorizeWithAi(HOUSEHOLD_ID, db);
    expect(result).toMatchObject({ categorized: 1, lowConfidence: 0 });

    const row = await read("txn-2b");
    expect(row.categorySource).toBe("ai");

    await close();
  });

  it("stamps a row the model returned no pick for, so it is not resent forever", async () => {
    // The counterpart guarantee: the model answering and simply not naming a
    // row is a real verdict. Without this, rows the model keeps skipping
    // would be resent on every single sync.
    await setup();
    await insertTxn("txn-2c", "Hankiyuhanshin Shiyogi Osaka JPN");

    mockAssignments([]);
    const result = await categorizeWithAi(HOUSEHOLD_ID, db);
    expect(result.categorized).toBe(0);

    const row = await read("txn-2c");
    expect(row.categoryId).toBeNull();
    expect(row.aiCategorizationAttemptedAt).not.toBeNull();

    vi.mocked(generateText).mockClear();
    await categorizeWithAi(HOUSEHOLD_ID, db);
    expect(generateText).not.toHaveBeenCalled();

    await close();
  });

  it("leaves an unparseable response unstamped so the next sync retries it", async () => {
    await setup();
    await insertTxn("txn-3", "Ekimo Umeda");

    vi.mocked(generateText).mockResolvedValue({ output: undefined } as never);
    await categorizeWithAi(HOUSEHOLD_ID, db);

    const row = await read("txn-3");
    expect(row.aiCategorizationAttemptedAt).toBeNull();

    await close();
  });

  it("stamps only the batches that succeeded when one of several fails", async () => {
    // getBatchSize("custom") is 20, so 21 rows split into two batches: the
    // first answers, the second throws. Only the first may be stamped.
    await setup();
    vi.stubEnv("AI_PROVIDER", "custom");
    vi.stubEnv("AI_BASE_URL", "http://localhost:1/v1");
    for (let i = 0; i < 21; i++) await insertTxn(`txn-b${i}`, `Merchant ${i}`);

    vi.mocked(generateText)
      .mockResolvedValueOnce({ output: { assignments: [] } } as never)
      .mockRejectedValueOnce(new Error("429 rate limited"));

    await categorizeWithAi(HOUSEHOLD_ID, db);

    const rows = await db.select().from(transactions).where(eq(transactions.householdId, HOUSEHOLD_ID));
    const stamped = rows.filter((r) => r.aiCategorizationAttemptedAt !== null);
    expect(stamped).toHaveLength(20);

    vi.stubEnv("AI_PROVIDER", "google");
    vi.stubEnv("AI_BASE_URL", "");
    await close();
  });
});
