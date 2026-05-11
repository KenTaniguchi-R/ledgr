import { eq } from "drizzle-orm";
import { plaidItems, type PlaidItemStatus } from "@/db/schema";
import { db as defaultDb, type LedgrDb } from "@/db";
import { syncInstitution } from "./sync";
import { REAUTH_ERROR_CODES } from "./utils";
import type { WebhookPayload } from "./schemas";
import { DEMO_HOUSEHOLD_ID } from "@/lib/demo-mode";

type WebhookContext = { db: LedgrDb; payload: WebhookPayload };
type WebhookHandler = (ctx: WebhookContext) => Promise<void>;

async function findItemByPlaidId(db: LedgrDb, plaidItemIdValue: string) {
  const [row] = await db
    .select({ id: plaidItems.id, householdId: plaidItems.householdId })
    .from(plaidItems)
    .where(eq(plaidItems.plaidItemId, plaidItemIdValue))
    .limit(1);
  return row ?? null;
}

async function updateItemStatus(db: LedgrDb, itemId: string, status: PlaidItemStatus, errorCode: string | null) {
  await db.update(plaidItems)
    .set({ status, errorCode, updatedAt: new Date() })
    .where(eq(plaidItems.id, itemId));
}

async function handleSyncUpdates({ db, payload }: WebhookContext): Promise<void> {
  const item = await findItemByPlaidId(db, payload.item_id);
  if (!item) {
    console.warn(`[webhook] No plaid_items row for plaid_item_id=${payload.item_id}`);
    return;
  }
  if (item.householdId === DEMO_HOUSEHOLD_ID) return;
  await syncInstitution(item.id, item.householdId, db);
}

async function handleItemError({ db, payload }: WebhookContext): Promise<void> {
  if (!payload.error) {
    console.warn(`[webhook] ITEM:ERROR without error field for item_id=${payload.item_id}`);
    return;
  }

  const item = await findItemByPlaidId(db, payload.item_id);
  if (!item) {
    console.warn(`[webhook] No plaid_items row for plaid_item_id=${payload.item_id}`);
    return;
  }
  if (item.householdId === DEMO_HOUSEHOLD_ID) return;

  const code = payload.error.error_code;
  if (REAUTH_ERROR_CODES.has(code)) {
    await updateItemStatus(db, item.id, "reauth_required", code);
  } else {
    await updateItemStatus(db, item.id, "error", code);
  }
}

async function handlePendingExpiration({ db, payload }: WebhookContext): Promise<void> {
  const item = await findItemByPlaidId(db, payload.item_id);
  if (!item) {
    console.warn(`[webhook] No plaid_items row for plaid_item_id=${payload.item_id}`);
    return;
  }
  if (item.householdId === DEMO_HOUSEHOLD_ID) return;
  await updateItemStatus(db, item.id, "reauth_required", null);
}

async function handlePermissionRevoked({ db, payload }: WebhookContext): Promise<void> {
  const item = await findItemByPlaidId(db, payload.item_id);
  if (!item) {
    console.warn(`[webhook] No plaid_items row for plaid_item_id=${payload.item_id}`);
    return;
  }
  if (item.householdId === DEMO_HOUSEHOLD_ID) return;
  await updateItemStatus(db, item.id, "revoked", null);
}

const WEBHOOK_HANDLERS: Record<string, WebhookHandler> = {
  "TRANSACTIONS:SYNC_UPDATES_AVAILABLE": handleSyncUpdates,
  "ITEM:ERROR": handleItemError,
  "ITEM:PENDING_EXPIRATION": handlePendingExpiration,
  "ITEM:USER_PERMISSION_REVOKED": handlePermissionRevoked,
};

export async function dispatchWebhook(
  payload: WebhookPayload,
  db: LedgrDb = defaultDb,
): Promise<void> {
  const key = `${payload.webhook_type}:${payload.webhook_code}`;
  const handler = WEBHOOK_HANDLERS[key];
  if (!handler) {
    console.log(`[webhook] Unhandled webhook: ${key}`);
    return;
  }
  await handler({ db, payload });
}
