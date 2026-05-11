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

const HOUSEHOLD_ID = "hh-webhook-test";
const INTERNAL_ITEM_ID = "internal-item-webhook";
const PLAID_ITEM_ID_VALUE = "plaid-item-wh-123";

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

describe("dispatchWebhook", () => {
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

  async function seedTestData(testDb: LedgrDb) {
    const now = new Date();
    await testDb.insert(households).values({ id: HOUSEHOLD_ID, name: "Test", createdAt: now, updatedAt: now });
    await testDb.insert(householdMembers).values({ id: uuid(), householdId: HOUSEHOLD_ID, userId: "user-1", role: "owner", createdAt: now });
    await testDb.insert(plaidItems).values({
      id: INTERNAL_ITEM_ID,
      householdId: HOUSEHOLD_ID,
      accessToken: encrypt("access-sandbox-test-token"),
      plaidItemId: PLAID_ITEM_ID_VALUE,
      institutionName: "Chase",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await testDb.insert(accounts).values({
      id: "acc-wh-checking",
      householdId: HOUSEHOLD_ID,
      plaidItemId: INTERNAL_ITEM_ID,
      plaidAccountId: "plaid-acc-checking",
      name: "Checking",
      type: "checking",
      createdAt: now,
      updatedAt: now,
    });
  }

  it("SYNC_UPDATES_AVAILABLE triggers syncInstitution", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    await setup();
    await seedTestData(db);

    server.use(
      http.post("https://sandbox.plaid.com/transactions/sync", () =>
        HttpResponse.json({ added: [], modified: [], removed: [], has_more: false, next_cursor: "cursor_wh", request_id: "req-wh" })
      )
    );

    await dispatchWebhook({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: PLAID_ITEM_ID_VALUE }, db);

    const logs = await db.select().from(syncLog).where(eq(syncLog.plaidItemId, INTERNAL_ITEM_ID));
    expect(logs).toHaveLength(1);
    expect(logs[0].cursorAfter).toBe("cursor_wh");
  });

  it("ITEM:ERROR with ITEM_LOGIN_REQUIRED sets reauth_required", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    await setup();
    await seedTestData(db);

    await dispatchWebhook({
      webhook_type: "ITEM",
      webhook_code: "ERROR",
      item_id: PLAID_ITEM_ID_VALUE,
      error: { error_type: "ITEM_ERROR", error_code: "ITEM_LOGIN_REQUIRED", error_message: "login required" },
    }, db);

    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID));
    expect(item!.status).toBe("reauth_required");
    expect(item!.errorCode).toBe("ITEM_LOGIN_REQUIRED");
  });

  it("ITEM:ERROR with INSTITUTION_DOWN sets error status", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    await setup();
    await seedTestData(db);

    await dispatchWebhook({
      webhook_type: "ITEM",
      webhook_code: "ERROR",
      item_id: PLAID_ITEM_ID_VALUE,
      error: { error_type: "INSTITUTION_ERROR", error_code: "INSTITUTION_DOWN", error_message: "down" },
    }, db);

    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID));
    expect(item!.status).toBe("error");
    expect(item!.errorCode).toBe("INSTITUTION_DOWN");
  });

  it("ITEM:ERROR with missing error field is a no-op", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    await setup();
    await seedTestData(db);

    await dispatchWebhook({
      webhook_type: "ITEM",
      webhook_code: "ERROR",
      item_id: PLAID_ITEM_ID_VALUE,
    }, db);

    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID));
    expect(item!.status).toBe("active");
  });

  it("ITEM:PENDING_EXPIRATION sets reauth_required", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    await setup();
    await seedTestData(db);

    await dispatchWebhook({
      webhook_type: "ITEM",
      webhook_code: "PENDING_EXPIRATION",
      item_id: PLAID_ITEM_ID_VALUE,
    }, db);

    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID));
    expect(item!.status).toBe("reauth_required");
  });

  it("ITEM:USER_PERMISSION_REVOKED sets revoked status", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    await setup();
    await seedTestData(db);

    await dispatchWebhook({
      webhook_type: "ITEM",
      webhook_code: "USER_PERMISSION_REVOKED",
      item_id: PLAID_ITEM_ID_VALUE,
    }, db);

    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID));
    expect(item!.status).toBe("revoked");
  });

  it("unknown webhook type is a no-op", async () => {
    const { dispatchWebhook } = await import("@/lib/plaid/webhook-handlers");
    await setup();
    await seedTestData(db);

    await dispatchWebhook({
      webhook_type: "UNKNOWN",
      webhook_code: "SOMETHING",
      item_id: PLAID_ITEM_ID_VALUE,
    }, db);

    const [item] = await db.select().from(plaidItems).where(eq(plaidItems.id, INTERNAL_ITEM_ID));
    expect(item!.status).toBe("active");
  });
});
