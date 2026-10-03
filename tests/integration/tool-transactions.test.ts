import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { LedgrDb } from "@/db";
import { accounts, bankConnections, transactions } from "@/db/schema";
import { getToolTransactions } from "@/queries/transactions";
import {
  insertAccount,
  insertCategory,
  insertCategoryGroup,
  insertHousehold,
  insertTransaction,
} from "./helpers";
import { createTestDb } from "./setup";

describe("read-only transaction tool query", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  async function householdWithAccount(accountName = "Checking") {
    const { householdId } = await insertHousehold(db, `Tool Household ${uuid()}`);
    const { accountId } = await insertAccount(db, householdId, { name: accountName });
    return { householdId, accountId };
  }

  it("returns only the requested household's transactions", async () => {
    const mine = await householdWithAccount();
    const theirs = await householdWithAccount();
    await insertTransaction(db, mine.householdId, mine.accountId, { name: "Mine" });
    await insertTransaction(db, theirs.householdId, theirs.accountId, { name: "Theirs" });

    const page = await getToolTransactions(mine.householdId, {}, 50, null, db);

    expect(page.transactions.map((transaction) => transaction.name)).toEqual(["Mine"]);
  });

  it("applies inclusive date filters", async () => {
    const context = await householdWithAccount();
    await insertTransaction(db, context.householdId, context.accountId, {
      name: "Before",
      date: "2026-05-09",
    });
    await insertTransaction(db, context.householdId, context.accountId, {
      name: "Start",
      date: "2026-05-10",
    });
    await insertTransaction(db, context.householdId, context.accountId, {
      name: "End",
      date: "2026-05-20",
    });
    await insertTransaction(db, context.householdId, context.accountId, {
      name: "After",
      date: "2026-05-21",
    });

    const page = await getToolTransactions(
      context.householdId,
      { dateFrom: "2026-05-10", dateTo: "2026-05-20" },
      50,
      null,
      db,
    );

    expect(page.transactions.map((transaction) => transaction.name)).toEqual(["End", "Start"]);
  });

  it("filters by account", async () => {
    const { householdId } = await insertHousehold(db, `Tool Household ${uuid()}`);
    const { accountId: checkingId } = await insertAccount(db, householdId, { name: "Checking" });
    const { accountId: savingsId } = await insertAccount(db, householdId, { name: "Savings" });
    await insertTransaction(db, householdId, checkingId, { name: "Checking Transaction" });
    await insertTransaction(db, householdId, savingsId, { name: "Savings Transaction" });

    const page = await getToolTransactions(
      householdId,
      { accountId: savingsId },
      50,
      null,
      db,
    );

    expect(page.transactions.map((transaction) => transaction.name)).toEqual([
      "Savings Transaction",
    ]);
  });

  it("filters by category", async () => {
    const context = await householdWithAccount();
    const { groupId } = await insertCategoryGroup(db, context.householdId);
    const { categoryId: groceriesId } = await insertCategory(
      db,
      context.householdId,
      groupId,
      { name: "Groceries" },
    );
    const { categoryId: utilitiesId } = await insertCategory(
      db,
      context.householdId,
      groupId,
      { name: "Utilities" },
    );
    await insertTransaction(db, context.householdId, context.accountId, {
      name: "Market",
      categoryId: groceriesId,
    });
    await insertTransaction(db, context.householdId, context.accountId, {
      name: "Power",
      categoryId: utilitiesId,
    });

    const page = await getToolTransactions(
      context.householdId,
      { categoryId: groceriesId },
      50,
      null,
      db,
    );

    expect(page.transactions.map((transaction) => transaction.name)).toEqual(["Market"]);
  });

  it("paginates without overlap and respects the requested limit", async () => {
    const context = await householdWithAccount();
    for (const [name, date] of [
      ["Newest", "2026-05-03"],
      ["Middle", "2026-05-02"],
      ["Oldest", "2026-05-01"],
    ] as const) {
      await insertTransaction(db, context.householdId, context.accountId, { name, date });
    }

    const first = await getToolTransactions(context.householdId, {}, 2, null, db);
    const second = await getToolTransactions(
      context.householdId,
      {},
      2,
      first.nextCursor,
      db,
    );

    expect(first.transactions.map((transaction) => transaction.name)).toEqual([
      "Newest",
      "Middle",
    ]);
    expect(first.nextCursor).not.toBeNull();
    expect(second.transactions.map((transaction) => transaction.name)).toEqual(["Oldest"]);
    expect(second.nextCursor).toBeNull();
  });

  it("orders equal-date rows deterministically by descending id", async () => {
    const context = await householdWithAccount();
    const suffix = uuid();
    await insertTransaction(db, context.householdId, context.accountId, {
      id: `tool-a-${suffix}`,
      name: "Alpha ID",
      date: "2026-05-01",
    });
    await insertTransaction(db, context.householdId, context.accountId, {
      id: `tool-z-${suffix}`,
      name: "Zulu ID",
      date: "2026-05-01",
    });

    const first = await getToolTransactions(context.householdId, {}, 50, null, db);
    const second = await getToolTransactions(context.householdId, {}, 50, null, db);

    expect(first.transactions.map((transaction) => transaction.name)).toEqual([
      "Zulu ID",
      "Alpha ID",
    ]);
    expect(second).toEqual(first);
  });

  it("returns an allowlisted DTO and keeps transfer rows visible", async () => {
    const { householdId } = await insertHousehold(db, `Tool Household ${uuid()}`);
    const connectionId = uuid();
    await db.insert(bankConnections).values({
      id: connectionId,
      householdId,
      provider: "plaid",
      credential: "encrypted-sensitive-credential",
      plaidItemId: "sensitive-item-id",
    });
    const { accountId } = await insertAccount(db, householdId, {
      name: "Checking",
      bankConnectionId: connectionId,
      externalAccountId: "sensitive-account-id",
    });
    const { groupId } = await insertCategoryGroup(db, householdId);
    const { categoryId } = await insertCategory(db, householdId, groupId, {
      name: "Transfers",
    });
    const { transactionId } = await insertTransaction(db, householdId, accountId, {
      name: "Card Payment",
      date: "2026-05-01",
      normalizedAmount: -4250,
      currency: "USD",
      categoryId,
      isTransfer: true,
      pending: true,
      notes: "Scheduled payment",
      externalId: "sensitive-transaction-id",
      provider: "plaid",
      transferPairId: "internal-pair-id",
      pfcDetailed: "TRANSFER_OUT_ACCOUNT_TRANSFER",
    });

    const page = await getToolTransactions(householdId, {}, 50, null, db);

    expect(page.transactions).toEqual([
      {
        id: transactionId,
        date: "2026-05-01",
        name: "Card Payment",
        amountCents: -4250,
        currency: "USD",
        accountId,
        accountName: "Checking",
        categoryId,
        categoryName: "Transfers",
        isTransfer: true,
        pending: true,
        notes: "Scheduled payment",
        hasSplits: false,
      },
    ]);
    expect(JSON.stringify(page)).not.toMatch(
      /credential|bankConnectionId|externalAccountId|externalId|plaidItemId|transferPairId|pfcDetailed|encrypted-sensitive/i,
    );
  });


  it("does not hydrate joined labels from another household", async () => {
    const mine = await householdWithAccount("Mine");
    const theirs = await householdWithAccount("Other Household Account");
    const { groupId } = await insertCategoryGroup(db, theirs.householdId);
    const { categoryId } = await insertCategory(
      db,
      theirs.householdId,
      groupId,
      { name: "Other Household Category" },
    );
    await insertTransaction(db, mine.householdId, theirs.accountId, {
      name: "Mismatched References",
      categoryId,
    });

    const page = await getToolTransactions(mine.householdId, {}, 50, null, db);

    expect(page.transactions).toEqual([
      expect.objectContaining({
        name: "Mismatched References",
        accountName: "",
        categoryName: null,
      }),
    ]);
  });
  it("does not modify transaction rows", async () => {
    const context = await householdWithAccount();
    await insertTransaction(db, context.householdId, context.accountId, {
      name: "Untouched",
      isTransfer: true,
    });
    const before = await db
      .select()
      .from(transactions)
      .where(eq(transactions.householdId, context.householdId));

    await getToolTransactions(context.householdId, {}, 50, null, db);

    expect(
      await db
        .select()
        .from(transactions)
        .where(eq(transactions.householdId, context.householdId)),
    ).toEqual(before);
    expect(
      await db.select().from(accounts).where(eq(accounts.householdId, context.householdId)),
    ).toHaveLength(1);
  });
});
