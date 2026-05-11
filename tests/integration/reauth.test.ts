import { describe, it, expect, afterEach, beforeAll, afterAll, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { server } from "../mocks/server";
import { encrypt } from "@/lib/encryption";
import { resetPlaidClient } from "@/lib/plaid/client";
import { households, householdMembers, plaidItems, accounts, syncLog } from "@/db/schema";
import type { LedgrDb } from "@/db";

const HOUSEHOLD_ID = "hh-reauth-test";
const USER_ID = "user-reauth-1";
const ITEM_ID = "item-reauth-1";

beforeAll(() => {
  vi.stubEnv("PLAID_CLIENT_ID", "test-id");
  vi.stubEnv("PLAID_SECRET", "test-secret");
  vi.stubEnv("PLAID_ENV", "sandbox");
  vi.stubEnv("ENCRYPTION_KEY", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2");
  server.listen({ onUnhandledRequest: "error" });
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

describe("re-auth server actions", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeEach(() => {
    resetPlaidClient();
  });

  afterEach(async () => {
    server.resetHandlers();
    await close?.();
  });

  async function setup() {
    ({ db, close } = await createTestDb());
    return db;
  }

  async function seedItem(testDb: LedgrDb, status: "active" | "error" | "reauth_required" | "revoked" = "reauth_required") {
    const now = new Date();
    await testDb.insert(households).values({ id: HOUSEHOLD_ID, name: "Test", createdAt: now, updatedAt: now });
    await testDb.insert(householdMembers).values({ id: uuid(), householdId: HOUSEHOLD_ID, userId: USER_ID, role: "owner", createdAt: now });
    await testDb.insert(plaidItems).values({
      id: ITEM_ID,
      householdId: HOUSEHOLD_ID,
      accessToken: encrypt("access-sandbox-reauth-token"),
      plaidItemId: "plaid-item-reauth-1",
      institutionName: "Chase",
      status,
      errorCode: status === "reauth_required" ? "ITEM_LOGIN_REQUIRED" : null,
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(accounts).values({
      id: "acc-reauth-1",
      householdId: HOUSEHOLD_ID,
      plaidItemId: ITEM_ID,
      plaidAccountId: "plaid-acc-checking",
      name: "Checking",
      type: "checking",
      createdAt: now,
      updatedAt: now,
    });
  }

  it("createUpdateLinkToken returns link token for owned reauth_required item", async () => {
    const { createUpdateLinkTokenDirect } = await import("@/actions/reauth");
    await setup();
    await seedItem(db);

    server.use(
      http.post("https://sandbox.plaid.com/link/token/create", () =>
        HttpResponse.json({ link_token: "link-update-token-123", expiration: "2026-12-31T00:00:00Z", request_id: "req-update" })
      )
    );

    const result = await createUpdateLinkTokenDirect(ITEM_ID, HOUSEHOLD_ID, db);
    expect(result).toEqual({ linkToken: "link-update-token-123" });
  });

  it("createUpdateLinkToken rejects wrong household", async () => {
    const { createUpdateLinkTokenDirect } = await import("@/actions/reauth");
    await setup();
    await seedItem(db);

    const result = await createUpdateLinkTokenDirect(ITEM_ID, "wrong-household", db);
    expect(result).toEqual({ error: "Institution not found" });
  });

  it("completeReAuth resets status and triggers sync", async () => {
    const { completeReAuthDirect } = await import("@/actions/reauth");
    await setup();
    await seedItem(db);

    server.use(
      http.post("https://sandbox.plaid.com/item/get", () =>
        HttpResponse.json({
          item: { item_id: "plaid-item-reauth-1", institution_id: "ins_1", error: null },
          request_id: "req-item-get",
        })
      ),
      http.post("https://sandbox.plaid.com/transactions/sync", () =>
        HttpResponse.json({ added: [], modified: [], removed: [], has_more: false, next_cursor: "cursor_reauth", request_id: "req-sync-reauth" })
      )
    );

    const result = await completeReAuthDirect(ITEM_ID, HOUSEHOLD_ID, db);
    expect(result).toEqual({ success: true });

    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, ITEM_ID));
    expect(item!.status).toBe("active");
    expect(item!.errorCode).toBeNull();

    const logs = await db.select().from(syncLog).where(eq(syncLog.plaidItemId, ITEM_ID));
    expect(logs).toHaveLength(1);
  });
});
