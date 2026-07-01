import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createTestDb } from "./setup";
import { insertHousehold, insertPlaidItem } from "./helpers";
import type { LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema/plaid";
import { encrypt, decrypt } from "@/lib/encryption";
import { rotateEncryptionKeys } from "@/lib/jobs/rotate-encryption-keys";

describe("rotateEncryptionKeys (integration)", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
  });
  afterAll(async () => {
    delete process.env.ENCRYPTION_KEY_V2;
    await close();
  });

  it("re-encrypts old-version rows to the active key and is idempotent", async () => {
    // Seed under v1 — including a legacy unprefixed token, as written by
    // the pre-versioning code.
    const legacyToken = encrypt("access-prod-legacy").replace(/^v1:/, "");
    const v1Token = encrypt("access-prod-v1");

    const { householdId } = await insertHousehold(db, "Rotate HH");
    await insertPlaidItem(db, householdId, { id: "item-legacy", accessToken: legacyToken });
    await insertPlaidItem(db, householdId, { id: "item-v1", accessToken: v1Token });

    // Introduce v2 — it becomes the active write key.
    process.env.ENCRYPTION_KEY_V2 = randomBytes(32).toString("hex");

    const report = await rotateEncryptionKeys(db);
    expect(report).toEqual({ total: 2, rotated: 2, skipped: 0, failed: 0 });

    const rows = await db
      .select({ id: plaidItems.id, accessToken: plaidItems.accessToken })
      .from(plaidItems)
      .where(eq(plaidItems.householdId, householdId));
    for (const row of rows) {
      expect(row.accessToken).toMatch(/^v2:/);
    }
    const legacyRow = rows.find((r) => r.id === "item-legacy");
    expect(decrypt(legacyRow!.accessToken)).toBe("access-prod-legacy");

    // Second run: nothing left to rotate.
    const second = await rotateEncryptionKeys(db);
    expect(second).toEqual({ total: 2, rotated: 0, skipped: 2, failed: 0 });
  });

  it("isolates per-row failures and keeps going", async () => {
    // Clear the V2 key from the previous test so this token is written as v1.
    delete process.env.ENCRYPTION_KEY_V2;
    const { householdId } = await insertHousehold(db, "Bad HH");
    await insertPlaidItem(db, householdId, { id: "item-garbage", accessToken: "not-valid-ciphertext" });
    await insertPlaidItem(db, householdId, { id: "item-good", accessToken: encrypt("access-good") });
    process.env.ENCRYPTION_KEY_V2 = randomBytes(32).toString("hex");

    const report = await rotateEncryptionKeys(db);
    // 2 rows from the previous test are already v2 → skipped; of these 2,
    // the garbage row fails to decrypt and the good row rotates v1 → v2.
    expect(report).toEqual({ total: 4, rotated: 1, skipped: 2, failed: 1 });

    const [good] = await db
      .select({ accessToken: plaidItems.accessToken })
      .from(plaidItems)
      .where(eq(plaidItems.id, "item-good"));
    expect(good.accessToken).toMatch(/^v2:/);
    expect(decrypt(good.accessToken)).toBe("access-good");
  });
});
