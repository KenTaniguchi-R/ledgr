import { db as defaultDb } from "@/db";
import type { LedgrDb } from "@/db";
import { syncLog } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

const SYNC_COOLDOWN_MS = 60_000;

export function checkSyncRateLimit(
  plaidItemId: string,
  db: LedgrDb = defaultDb,
): { allowed: boolean; retryAfterSeconds?: number } {
  const lastSync = db
    .select({ syncedAt: syncLog.syncedAt })
    .from(syncLog)
    .where(eq(syncLog.plaidItemId, plaidItemId))
    .orderBy(desc(syncLog.syncedAt))
    .limit(1)
    .get();

  if (!lastSync) return { allowed: true };

  const elapsed = Date.now() - new Date(lastSync.syncedAt).getTime();
  if (elapsed >= SYNC_COOLDOWN_MS) return { allowed: true };

  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((SYNC_COOLDOWN_MS - elapsed) / 1000),
  };
}
