import { isNull, eq } from "drizzle-orm";
import { db } from "@/db";
import { bankConnections } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid/client";

async function backfill() {
  const items = await db
    .select({ id: bankConnections.id, credential: bankConnections.credential })
    .from(bankConnections)
    .where(isNull(bankConnections.plaidItemId));

  if (items.length === 0) {
    console.log("No items to backfill.");
    return;
  }

  console.log(`Backfilling ${items.length} item(s)...`);
  const client = getPlaidClient();

  for (const item of items) {
    try {
      const accessToken = decrypt(item.credential);
      const res = await client.itemGet({ access_token: accessToken });
      const plaidItemIdValue = res.data.item.item_id;

      await db.update(bankConnections)
        .set({ plaidItemId: plaidItemIdValue })
        .where(eq(bankConnections.id, item.id));

      console.log(`  ✓ ${item.id} → ${plaidItemIdValue}`);
    } catch (err) {
      console.error(`  ✗ ${item.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("Backfill complete.");
}

backfill().catch(console.error);
