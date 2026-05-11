import { isNull, eq } from "drizzle-orm";
import { db } from "@/db";
import { plaidItems } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid/client";

async function backfill() {
  const items = await db
    .select({ id: plaidItems.id, accessToken: plaidItems.accessToken })
    .from(plaidItems)
    .where(isNull(plaidItems.plaidItemId));

  if (items.length === 0) {
    console.log("No items to backfill.");
    return;
  }

  console.log(`Backfilling ${items.length} item(s)...`);
  const client = getPlaidClient();

  for (const item of items) {
    try {
      const accessToken = decrypt(item.accessToken);
      const res = await client.itemGet({ access_token: accessToken });
      const plaidItemIdValue = res.data.item.item_id;

      await db.update(plaidItems)
        .set({ plaidItemId: plaidItemIdValue })
        .where(eq(plaidItems.id, item.id));

      console.log(`  ✓ ${item.id} → ${plaidItemIdValue}`);
    } catch (err) {
      console.error(`  ✗ ${item.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("Backfill complete.");
}

backfill().catch(console.error);
