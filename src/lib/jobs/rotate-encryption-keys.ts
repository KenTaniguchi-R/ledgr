import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema/plaid";
import { decrypt, encrypt, needsRotation } from "@/lib/encryption";

export type RotationReport = {
  total: number;
  rotated: number;
  skipped: number;
  failed: number;
};

/**
 * Re-encrypts every plaid_items.access_token written with an older key
 * version using the active (highest-configured) key. Idempotent — rows
 * already on the active version are skipped. Per-row errors are isolated
 * and reported so one corrupt row can't block a rotation.
 *
 * Operator flow: add ENCRYPTION_KEY_V<N> → restart app → run `pnpm rotate-keys`
 * → once it reports 0 rotated and 0 failed, the old key can be retired.
 */
export async function rotateEncryptionKeys(
  dbInstance: LedgrDb = defaultDb,
): Promise<RotationReport> {
  const rows = await dbInstance
    .select({ id: plaidItems.id, accessToken: plaidItems.accessToken })
    .from(plaidItems);

  const report: RotationReport = {
    total: rows.length,
    rotated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const row of rows) {
    try {
      if (!needsRotation(row.accessToken)) {
        report.skipped++;
        continue;
      }
      await dbInstance
        .update(plaidItems)
        .set({ accessToken: encrypt(decrypt(row.accessToken)), updatedAt: new Date() })
        .where(eq(plaidItems.id, row.id));
      report.rotated++;
    } catch (err) {
      report.failed++;
      console.error(`[rotate-keys] failed for plaid_item ${row.id}:`, err);
    }
  }

  return report;
}
