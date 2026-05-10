"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db as defaultDb, type LedgrDb } from "@/db";
import { plaidItems } from "@/db/schema";
import { getHouseholdId } from "@/lib/auth/session";
import { decrypt } from "@/lib/encryption";
import { syncRecurringTransactions } from "@/lib/plaid/recurring";

export async function refreshRecurring(
  dbInstance: LedgrDb = defaultDb,
): Promise<
  { success: true; upserted: number; deactivated: number } | { error: string }
> {
  try {
    const householdId = await getHouseholdId();

    const activeItems = dbInstance
      .select({
        id: plaidItems.id,
        accessToken: plaidItems.accessToken,
        householdId: plaidItems.householdId,
      })
      .from(plaidItems)
      .where(eq(plaidItems.status, "active"))
      .all()
      .filter((item) => item.householdId === householdId);

    let totalUpserted = 0;
    let totalDeactivated = 0;

    for (const item of activeItems) {
      const accessToken = decrypt(item.accessToken);
      const result = await syncRecurringTransactions(
        item.id,
        householdId,
        accessToken,
        dbInstance,
      );
      totalUpserted += result.upserted;
      totalDeactivated += result.deactivated;
    }

    revalidatePath("/bills");
    revalidatePath("/");

    return {
      success: true,
      upserted: totalUpserted,
      deactivated: totalDeactivated,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to refresh recurring";
    return { error: message };
  }
}
