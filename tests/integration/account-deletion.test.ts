import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import type { LedgrDb } from "@/db";
import {
  households,
  householdMembers,
  user,
  session,
  account as authAccount,
  userSettings,
  categoryGroups,
  categories,
  plaidItems,
  syncLog,
  institutionLogos,
  accounts,
  transactions,
  transactionSplits,
  investmentHoldings,
  holdingsHistory,
  investmentTransactions,
  balanceHistory,
  recurringTransactions,
  budgets,
  oauthCodes,
  oauthRefreshTokens,
  oauthConsents,
} from "@/db/schema";
import { deleteFinancialData, deleteAccount } from "@/lib/account-deletion";

/**
 * Seed one fully-populated household + user so deletions can be verified to touch
 * exactly the right tables (and nothing belonging to another household).
 */
async function seedHousehold(db: LedgrDb, s: string) {
  const hh = `hh-${s}`;
  const uid = `u-${s}`;

  await db.insert(user).values({
    id: uid,
    name: `User ${s}`,
    email: `${s}@example.com`,
    updatedAt: new Date(),
  });
  await db.insert(households).values({ id: hh, name: `HH ${s}` });
  await db.insert(householdMembers).values({
    id: `hm-${s}`,
    householdId: hh,
    userId: uid,
    role: "owner",
  });
  await db.insert(session).values({
    id: `sess-${s}`,
    token: `tok-${s}`,
    userId: uid,
    expiresAt: new Date(Date.now() + 1_000_000_000),
    updatedAt: new Date(),
  });
  await db.insert(authAccount).values({
    id: `authacc-${s}`,
    accountId: `acc-${s}`,
    providerId: "credential",
    userId: uid,
    password: "hashed",
    updatedAt: new Date(),
  });
  await db.insert(userSettings).values({ id: `us-${s}`, userId: uid });

  await db.insert(categoryGroups).values({ id: `cg-${s}`, householdId: hh, name: "Group" });
  await db.insert(categories).values({
    id: `cat-${s}`,
    householdId: hh,
    groupId: `cg-${s}`,
    name: "Cat",
  });

  await db.insert(plaidItems).values({
    id: `pi-${s}`,
    householdId: hh,
    accessToken: `enc-token-${s}`,
  });
  await db.insert(syncLog).values({ id: `sl-${s}`, plaidItemId: `pi-${s}` });
  await db.insert(institutionLogos).values({
    id: `il-${s}`,
    plaidItemId: `pi-${s}`,
    logo: "logo-data",
  });

  await db.insert(accounts).values({
    id: `ac-${s}`,
    householdId: hh,
    plaidItemId: `pi-${s}`,
    name: "Checking",
    type: "checking",
    currentBalance: 1000,
  });
  await db.insert(transactions).values({
    id: `tx-${s}`,
    accountId: `ac-${s}`,
    householdId: hh,
    date: "2026-01-01",
    originalName: "Coffee",
    name: "Coffee",
    amount: 500,
    normalizedAmount: 500,
  });
  await db.insert(transactionSplits).values({
    id: `sp-${s}`,
    transactionId: `tx-${s}`,
    categoryId: `cat-${s}`,
    amount: 500,
  });
  await db.insert(investmentHoldings).values({
    id: `ih-${s}`,
    accountId: `ac-${s}`,
    securityName: "AAPL",
    asOfDate: "2026-01-01",
  });
  await db.insert(holdingsHistory).values({
    id: `hist-${s}`,
    accountId: `ac-${s}`,
    date: "2026-01-01",
  });
  await db.insert(investmentTransactions).values({
    id: `it-${s}`,
    accountId: `ac-${s}`,
    amount: 1000,
    date: "2026-01-01",
  });
  await db.insert(balanceHistory).values({
    id: `bh-${s}`,
    accountId: `ac-${s}`,
    date: "2026-01-01",
    balance: 1000,
  });
  await db.insert(recurringTransactions).values({
    id: `rt-${s}`,
    householdId: hh,
    name: "Netflix",
  });
  await db.insert(budgets).values({ id: `bud-${s}`, householdId: hh, month: "2026-01" });

  await db.insert(oauthCodes).values({
    code: `code-${s}`,
    clientId: "client",
    userId: uid,
    householdId: hh,
    scope: "read",
    codeChallenge: "cc",
    redirectUri: "https://x",
    expiresAt: "2026-12-31",
  });
  await db.insert(oauthRefreshTokens).values({
    token: `rtok-${s}`,
    clientId: "client",
    userId: uid,
    householdId: hh,
    scope: "read",
    expiresAt: "2026-12-31",
  });
  await db.insert(oauthConsents).values({
    id: `consent-${s}`,
    userId: uid,
    clientId: "client",
    scope: "read",
    grantedAt: "2026-01-01",
  });

  return { hh, uid };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function count(db: LedgrDb, table: any, where: any): Promise<number> {
  const rows = await db.select().from(table).where(where);
  return rows.length;
}

describe("account deletion (integration)", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });
  afterAll(async () => {
    await close();
  });

  describe("deleteFinancialData", () => {
    it("erases all financial data but keeps login, categories, and budgets", async () => {
      const { hh, uid } = await seedHousehold(db, "fin");
      const revoked: string[] = [];

      await deleteFinancialData(hh, {
        db,
        revokePlaidItem: async (token) => {
          revoked.push(token);
        },
      });

      // Plaid items are revoked (best-effort) with their stored token.
      expect(revoked).toEqual(["enc-token-fin"]);

      // Financial data is gone.
      expect(await count(db, accounts, eq(accounts.householdId, hh))).toBe(0);
      expect(await count(db, transactions, eq(transactions.householdId, hh))).toBe(0);
      expect(await count(db, transactionSplits, eq(transactionSplits.id, "sp-fin"))).toBe(0);
      expect(await count(db, investmentHoldings, eq(investmentHoldings.accountId, "ac-fin"))).toBe(0);
      expect(await count(db, holdingsHistory, eq(holdingsHistory.accountId, "ac-fin"))).toBe(0);
      expect(await count(db, investmentTransactions, eq(investmentTransactions.accountId, "ac-fin"))).toBe(0);
      expect(await count(db, balanceHistory, eq(balanceHistory.accountId, "ac-fin"))).toBe(0);
      expect(await count(db, plaidItems, eq(plaidItems.householdId, hh))).toBe(0);
      expect(await count(db, syncLog, eq(syncLog.id, "sl-fin"))).toBe(0);
      expect(await count(db, institutionLogos, eq(institutionLogos.id, "il-fin"))).toBe(0);
      expect(await count(db, recurringTransactions, eq(recurringTransactions.householdId, hh))).toBe(0);

      // Login + configuration are kept.
      expect(await count(db, user, eq(user.id, uid))).toBe(1);
      expect(await count(db, households, eq(households.id, hh))).toBe(1);
      expect(await count(db, categories, eq(categories.householdId, hh))).toBe(1);
      expect(await count(db, budgets, eq(budgets.householdId, hh))).toBe(1);
      expect(await count(db, session, eq(session.userId, uid))).toBe(1);
    });

    it("does not touch another household's data", async () => {
      const a = await seedHousehold(db, "iso-a");
      const b = await seedHousehold(db, "iso-b");

      await deleteFinancialData(a.hh, { db, revokePlaidItem: async () => {} });

      expect(await count(db, accounts, eq(accounts.householdId, a.hh))).toBe(0);
      expect(await count(db, accounts, eq(accounts.householdId, b.hh))).toBe(1);
      expect(await count(db, transactions, eq(transactions.householdId, b.hh))).toBe(1);
      expect(await count(db, plaidItems, eq(plaidItems.householdId, b.hh))).toBe(1);
    });
  });

  describe("deleteAccount", () => {
    it("erases everything including login, sessions, and oauth grants", async () => {
      const { hh, uid } = await seedHousehold(db, "acct");
      const revoked: string[] = [];

      await deleteAccount(hh, uid, {
        db,
        revokePlaidItem: async (token) => {
          revoked.push(token);
        },
      });

      expect(revoked).toEqual(["enc-token-acct"]);

      // Household + all its data (cascade).
      expect(await count(db, households, eq(households.id, hh))).toBe(0);
      expect(await count(db, accounts, eq(accounts.householdId, hh))).toBe(0);
      expect(await count(db, transactions, eq(transactions.householdId, hh))).toBe(0);
      expect(await count(db, categories, eq(categories.householdId, hh))).toBe(0);
      expect(await count(db, budgets, eq(budgets.householdId, hh))).toBe(0);
      expect(await count(db, plaidItems, eq(plaidItems.householdId, hh))).toBe(0);

      // User + login artifacts.
      expect(await count(db, user, eq(user.id, uid))).toBe(0);
      expect(await count(db, session, eq(session.userId, uid))).toBe(0);
      expect(await count(db, authAccount, eq(authAccount.userId, uid))).toBe(0);
      expect(await count(db, userSettings, eq(userSettings.userId, uid))).toBe(0);

      // OAuth grants (no FK cascade — must be cleaned manually).
      expect(await count(db, oauthCodes, eq(oauthCodes.userId, uid))).toBe(0);
      expect(await count(db, oauthRefreshTokens, eq(oauthRefreshTokens.userId, uid))).toBe(0);
      expect(await count(db, oauthConsents, eq(oauthConsents.userId, uid))).toBe(0);
    });

    it("does not touch another user's account", async () => {
      const a = await seedHousehold(db, "del-a");
      const b = await seedHousehold(db, "del-b");

      await deleteAccount(a.hh, a.uid, { db, revokePlaidItem: async () => {} });

      expect(await count(db, user, eq(user.id, a.uid))).toBe(0);
      expect(await count(db, user, eq(user.id, b.uid))).toBe(1);
      expect(await count(db, households, eq(households.id, b.hh))).toBe(1);
      expect(await count(db, oauthConsents, eq(oauthConsents.userId, b.uid))).toBe(1);
    });
  });
});
