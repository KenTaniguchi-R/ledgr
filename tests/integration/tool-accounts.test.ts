import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { LedgrDb } from "@/db";
import { accounts, bankConnections } from "@/db/schema";
import { provisionHousehold } from "@/lib/auth/provision";
import { getToolAccounts } from "@/queries/accounts";
import { createTestDb } from "./setup";

describe("read-only account tool query", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  async function insertConnection(
    householdId: string,
    overrides: Partial<typeof bankConnections.$inferInsert> = {},
  ) {
    const id = uuid();
    await db.insert(bankConnections).values({
      id,
      householdId,
      provider: "plaid",
      credential: "encrypted-sensitive-credential",
      plaidInstitutionId: "ins_sensitive",
      plaidItemId: `item-${id}`,
      syncCursor: "sensitive-cursor",
      institutionName: "Test Bank",
      ...overrides,
    });
    return id;
  }

  async function insertAccount(
    householdId: string,
    overrides: Partial<typeof accounts.$inferInsert> = {},
  ) {
    const id = uuid();
    await db.insert(accounts).values({
      id,
      householdId,
      name: "Checking",
      type: "checking",
      currency: "USD",
      ...overrides,
    });
    return id;
  }

  it("returns only live accounts from the requested household, including hidden accounts", async () => {
    const mine = await provisionHousehold(`tool-user-${uuid()}`, db);
    const theirs = await provisionHousehold(`tool-user-${uuid()}`, db);

    await insertAccount(mine, { name: "Visible" });
    await insertAccount(mine, { name: "Hidden", isHidden: true });
    await insertAccount(mine, { name: "Deleted", deletedAt: new Date() });
    await insertAccount(theirs, { name: "Other Household" });

    const result = await getToolAccounts(mine, db);

    expect(result.map((account) => account.name)).toEqual(["Hidden", "Visible"]);
    expect(result.find((account) => account.name === "Hidden")?.isHidden).toBe(true);
  });

  it("projects institution and cent balances without sensitive connection fields", async () => {
    const householdId = await provisionHousehold(`tool-user-${uuid()}`, db);
    const connectionId = await insertConnection(householdId);
    const id = await insertAccount(householdId, {
      bankConnectionId: connectionId,
      externalAccountId: "external-sensitive-id",
      officialName: "Official Name",
      name: "Everyday Checking",
      subtype: "checking",
      currentBalance: 123456,
      availableBalance: 120000,
      creditLimit: 500000,
    });

    const result = await getToolAccounts(householdId, db);

    expect(result).toEqual([
      {
        id,
        name: "Everyday Checking",
        type: "checking",
        subtype: "checking",
        institution: "Test Bank",
        isHidden: false,
        currentBalanceCents: 123456,
        availableBalanceCents: 120000,
        currency: "USD",
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /credential|bankConnectionId|externalAccountId|plaidItemId|syncCursor|encrypted-sensitive/i,
    );
  });

  it("returns stable ordering and leaves account and connection rows unchanged", async () => {
    const householdId = await provisionHousehold(`tool-user-${uuid()}`, db);
    const connectionId = await insertConnection(householdId, { status: "revoked" });
    await insertAccount(householdId, {
      name: "Zulu Savings",
      type: "savings",
      bankConnectionId: connectionId,
    });
    await insertAccount(householdId, { name: "Alpha Checking", type: "checking" });

    const accountsBefore = await db.select().from(accounts).where(eq(accounts.householdId, householdId));
    const connectionsBefore = await db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.householdId, householdId));

    const first = await getToolAccounts(householdId, db);
    const second = await getToolAccounts(householdId, db);

    expect(second).toEqual(first);
    expect(first.map((account) => account.name)).toEqual(["Alpha Checking", "Zulu Savings"]);
    expect(await db.select().from(accounts).where(eq(accounts.householdId, householdId))).toEqual(
      accountsBefore,
    );
    expect(
      await db.select().from(bankConnections).where(eq(bankConnections.householdId, householdId)),
    ).toEqual(connectionsBefore);
  });
});
