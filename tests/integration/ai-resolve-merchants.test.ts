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
  merchants,
} from "@/db/schema";
import type { LedgrDb } from "@/db";

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: vi.fn() };
});
vi.mock("@/lib/favicon", () => ({ fetchFaviconDataUri: vi.fn() }));

const { generateText } = await import("ai");
const { fetchFaviconDataUri } = await import("@/lib/favicon");
const { resolveMerchantLogos } = await import("@/lib/ai/resolve-merchants");

const HOUSEHOLD_ID = "hh-ai-resolve-merchants";
const CATEGORY_ID = "cat-transit";
const CONNECTION_ID = "conn-simplefin";
const ACCOUNT_ID = "acc-simplefin";

function mockIdentifications(identifications: unknown[]) {
  (generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
    output: { identifications },
  });
}

describe("resolveMerchantLogos", () => {
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
    vi.mocked(fetchFaviconDataUri).mockReset();
  });

  let db: LedgrDb;
  let close: () => Promise<void>;

  async function setup() {
    ({ db, close } = await createTestDb());
    const now = new Date();

    await db.insert(households).values({ id: HOUSEHOLD_ID, name: "Test", createdAt: now, updatedAt: now });
    await db.insert(householdMembers).values({ id: uuid(), householdId: HOUSEHOLD_ID, userId: "user-1", role: "owner", createdAt: now });
    await db.insert(categoryGroups).values({ id: "grp-transit", householdId: HOUSEHOLD_ID, name: "Transportation" });
    await db.insert(categories).values({ id: CATEGORY_ID, householdId: HOUSEHOLD_ID, groupId: "grp-transit", name: "Public Transit" });
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

    return db;
  }

  async function insertTxn(
    id: string,
    name: string,
    opts: { merchantId?: string | null; categoryId?: string | null; merchantResolutionAttemptedAt?: Date | null } = {},
  ) {
    await db.insert(transactions).values({
      id,
      accountId: ACCOUNT_ID,
      householdId: HOUSEHOLD_ID,
      merchantId: opts.merchantId ?? null,
      categoryId: opts.categoryId ?? null,
      merchantResolutionAttemptedAt: opts.merchantResolutionAttemptedAt ?? null,
      date: "2026-08-28",
      originalName: name,
      name,
      amount: 1000,
      normalizedAmount: 1000,
    });
  }

  it("resolves a merchant and logo for an already-categorized transaction", async () => {
    // This is the whole point of decoupling: a rule/PFC tier already set the
    // category (as it would for "Clipper Transit Fare" in practice), so this
    // transaction never reaches the AI categorization tier at all — but it
    // still has no merchant, so it must still be picked up here.
    await setup();
    await insertTxn("txn-clipper", "Clipper Transit Fare", { categoryId: CATEGORY_ID });

    mockIdentifications([
      { transactionId: "txn-clipper", merchantName: "Clipper", merchantDomain: "clippercard.com" },
    ]);
    vi.mocked(fetchFaviconDataUri).mockResolvedValue("data:image/png;base64,Y2xpcHBlcg==");

    const result = await resolveMerchantLogos(HOUSEHOLD_ID, db);
    expect(result.resolved).toBe(1);

    const [txn] = await db.select().from(transactions).where(eq(transactions.id, "txn-clipper"));
    expect(txn.categoryId).toBe(CATEGORY_ID);
    expect(txn.merchantId).not.toBeNull();

    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, txn.merchantId!));
    expect(merchant.name).toBe("Clipper");
    expect(merchant.logoUrl).toBe("data:image/png;base64,Y2xpcHBlcg==");

    await close();
  });

  it("marks a genuine non-company as attempted so it isn't re-guessed on the next sync", async () => {
    await setup();
    await insertTxn("txn-transfer", "Apple Gs Savings Transfer");

    mockIdentifications([
      { transactionId: "txn-transfer", merchantName: null, merchantDomain: null },
    ]);

    const first = await resolveMerchantLogos(HOUSEHOLD_ID, db);
    expect(first.resolved).toBe(0);

    const [txn] = await db.select().from(transactions).where(eq(transactions.id, "txn-transfer"));
    expect(txn.merchantId).toBeNull();
    expect(txn.merchantResolutionAttemptedAt).not.toBeNull();

    // Second sync: query should no longer pick this transaction up at all.
    const second = await resolveMerchantLogos(HOUSEHOLD_ID, db);
    expect(second).toEqual({ resolved: 0, skipped: 0 });
    expect(generateText).toHaveBeenCalledTimes(1);

    await close();
  });

  it("does not re-process a transaction whose merchant resolution was already attempted", async () => {
    await setup();
    await insertTxn("txn-old-attempt", "Disco Dogs", { merchantResolutionAttemptedAt: new Date() });

    const result = await resolveMerchantLogos(HOUSEHOLD_ID, db);
    expect(result).toEqual({ resolved: 0, skipped: 0 });
    expect(generateText).not.toHaveBeenCalled();

    await close();
  });

  it("reuses an existing merchant by name and skips refetching a logo it already has", async () => {
    await setup();
    const existingMerchantId = uuid();
    await db.insert(merchants).values({
      id: existingMerchantId,
      householdId: HOUSEHOLD_ID,
      name: "Fedex",
      rawNames: JSON.stringify(["FEDEX*1234"]),
      logoUrl: "https://plaid-merchant-logos.plaid.com/fedex.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await insertTxn("txn-fedex-2", "FedEx Ground");

    mockIdentifications([
      { transactionId: "txn-fedex-2", merchantName: "FedEx", merchantDomain: "fedex.com" },
    ]);

    await resolveMerchantLogos(HOUSEHOLD_ID, db);

    const [txn] = await db.select().from(transactions).where(eq(transactions.id, "txn-fedex-2"));
    expect(txn.merchantId).toBe(existingMerchantId);
    expect(fetchFaviconDataUri).not.toHaveBeenCalled();

    const allMerchants = await db.select().from(merchants).where(eq(merchants.householdId, HOUSEHOLD_ID));
    expect(allMerchants).toHaveLength(1);

    await close();
  });

  it("never touches a transaction that already has a merchant link", async () => {
    await setup();
    const plaidMerchantId = uuid();
    await db.insert(merchants).values({
      id: plaidMerchantId,
      householdId: HOUSEHOLD_ID,
      name: "Amazon",
      rawNames: JSON.stringify(["AMAZON.COM*1A2B3"]),
      logoUrl: "https://plaid-merchant-logos.plaid.com/amazon.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await insertTxn("txn-amazon", "Amazon", { merchantId: plaidMerchantId });

    const result = await resolveMerchantLogos(HOUSEHOLD_ID, db);
    expect(result).toEqual({ resolved: 0, skipped: 0 });
    expect(generateText).not.toHaveBeenCalled();

    const [txn] = await db.select().from(transactions).where(eq(transactions.id, "txn-amazon"));
    expect(txn.merchantId).toBe(plaidMerchantId);

    await close();
  });

  it("ignores a hallucinated domain that isn't a plausible hostname", async () => {
    await setup();
    await insertTxn("txn-weird", "Some Weird Charge");

    mockIdentifications([
      { transactionId: "txn-weird", merchantName: "Weird Co", merchantDomain: "not a domain!!" },
    ]);

    await resolveMerchantLogos(HOUSEHOLD_ID, db);

    const [txn] = await db.select().from(transactions).where(eq(transactions.id, "txn-weird"));
    expect(txn.merchantId).toBeNull();
    expect(txn.merchantResolutionAttemptedAt).not.toBeNull();
    expect(fetchFaviconDataUri).not.toHaveBeenCalled();

    await close();
  });
});
