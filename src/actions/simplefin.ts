"use server";

import { v4 as uuid } from "uuid";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { claimSetupToken, simplefinRequest, SimplefinHttpError } from "@/lib/simplefin/client";
import { SimplefinAccountsResponseSchema, resolveInstitution } from "@/lib/simplefin/schemas";
import { syncConnection } from "@/lib/simplefin/sync";
import { encrypt } from "@/lib/encryption";
import { simplefinAmountToCents } from "@/lib/money";
import { todayDateString } from "@/lib/date-utils";
import { authorizeAction } from "@/lib/auth/authorize-action";
import { scopedQuery } from "@/lib/scoped-query";
import { db as defaultDb, type LedgrDb } from "@/db";
import { bankConnections, accounts, balanceHistory } from "@/db/schema";
import type { AccountType } from "@/db/schema/accounts";

// ---------------------------------------------------------------------------
// Step 1: claim the Setup Token and discover accounts
// ---------------------------------------------------------------------------

export interface DiscoveredAccount {
  externalAccountId: string;
  name: string;
  currency: string;
  currentBalanceCents: number | null;
  availableBalanceCents: number | null;
}

export interface DiscoveredConnection {
  connectionId: string;
  institutionName: string | null;
  accounts: DiscoveredAccount[];
}

export async function claimAndDiscoverAccountsDirect(
  setupToken: string,
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<
  | { success: true; connections: DiscoveredConnection[]; error?: never }
  | { success: false; error: string; connections?: never }
> {
  let accessUrl: string;
  try {
    accessUrl = await claimSetupToken(setupToken);
  } catch (e: unknown) {
    if (e instanceof SimplefinHttpError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: "Failed to claim SimpleFIN Setup Token" };
  }

  try {
    const raw = await simplefinRequest(accessUrl, "/accounts", {
      version: 2,
      "balances-only": 1,
    });
    const parsed = SimplefinAccountsResponseSchema.parse(raw);

    if (parsed.accounts.length === 0) {
      return { success: false, error: "No accounts found for this Setup Token" };
    }

    // Group discovered accounts by institution — each institution becomes
    // its own bank_connections row sharing this same encrypted credential,
    // so per-institution grouping/disconnect/reauth works exactly like Plaid.
    const groups = new Map<string, { institutionName: string | null; accounts: typeof parsed.accounts }>();
    for (const account of parsed.accounts) {
      const { externalOrgId, institutionName } = resolveInstitution(account, parsed.connections);
      const group = groups.get(externalOrgId);
      if (group) {
        group.accounts.push(account);
      } else {
        groups.set(externalOrgId, { institutionName, accounts: [account] });
      }
    }

    const encryptedCredential = encrypt(accessUrl);
    const connections: DiscoveredConnection[] = [];

    await db.transaction(async (tx) => {
      for (const { institutionName, accounts: groupAccounts } of groups.values()) {
        const connectionId = uuid();
        await tx.insert(bankConnections).values({
          id: connectionId,
          householdId,
          provider: "simplefin",
          credential: encryptedCredential,
          institutionName,
          status: "pending_classification",
        });

        connections.push({
          connectionId,
          institutionName,
          accounts: groupAccounts.map((account) => ({
            externalAccountId: account.id,
            name: account.name,
            currency: account.currency,
            currentBalanceCents: simplefinAmountToCents(account.balance),
            availableBalanceCents: account["available-balance"]
              ? simplefinAmountToCents(account["available-balance"])
              : null,
          })),
        });
      }
    });

    return { success: true, connections };
  } catch (e: unknown) {
    console.error("SimpleFIN account discovery failed:", e);
    return { success: false, error: "Failed to fetch accounts from SimpleFIN" };
  }
}

export async function claimAndDiscoverAccounts(setupToken: string) {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;
  return claimAndDiscoverAccountsDirect(setupToken, auth.householdId);
}

// ---------------------------------------------------------------------------
// Step 2: classify discovered accounts and finalize the connection(s)
// ---------------------------------------------------------------------------

export interface AccountClassification {
  externalAccountId: string;
  name: string;
  currency: string;
  currentBalanceCents: number | null;
  availableBalanceCents: number | null;
  type: AccountType;
}

export interface ConnectionClassification {
  connectionId: string;
  accounts: AccountClassification[];
}

export async function confirmSimplefinAccountsDirect(
  connectionGroups: ConnectionClassification[],
  householdId: string,
  db: LedgrDb = defaultDb,
): Promise<
  | { success: true; accountCount: number; connectionIds: string[]; error?: never }
  | { success: false; error: string; accountCount?: never; connectionIds?: never }
> {
  const scoped = scopedQuery(householdId, db);
  const today = todayDateString();
  let accountCount = 0;

  try {
    await db.transaction(async (tx) => {
      for (const group of connectionGroups) {
        const [connection] = await db
          .select({ id: bankConnections.id, status: bankConnections.status })
          .from(bankConnections)
          .where(scoped.where(bankConnections, eq(bankConnections.id, group.connectionId)))
          .limit(1);

        if (!connection || connection.status !== "pending_classification") {
          throw new Error(`Connection ${group.connectionId} not found or already confirmed`);
        }

        await tx.update(bankConnections)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(bankConnections.id, group.connectionId));

        for (const account of group.accounts) {
          const [existingDeleted] = await tx
            .select({ id: accounts.id })
            .from(accounts)
            .where(
              and(
                eq(accounts.externalAccountId, account.externalAccountId),
                eq(accounts.householdId, householdId),
                isNotNull(accounts.deletedAt),
              ),
            )
            .orderBy(desc(accounts.deletedAt))
            .limit(1);

          const accountFields = {
            name: account.name,
            type: account.type,
            currentBalance: account.currentBalanceCents,
            availableBalance: account.availableBalanceCents,
            currency: account.currency,
          };

          let accountId: string;
          if (existingDeleted) {
            accountId = existingDeleted.id;
            await tx.update(accounts)
              .set({ ...accountFields, deletedAt: null, bankConnectionId: group.connectionId, updatedAt: new Date() })
              .where(eq(accounts.id, existingDeleted.id));
          } else {
            accountId = uuid();
            await tx.insert(accounts).values({
              id: accountId,
              householdId,
              bankConnectionId: group.connectionId,
              externalAccountId: account.externalAccountId,
              ...accountFields,
            });
          }

          if (accountFields.currentBalance !== null) {
            await tx.insert(balanceHistory)
              .values({ id: uuid(), accountId, date: today, balance: accountFields.currentBalance })
              .onConflictDoUpdate({
                target: [balanceHistory.accountId, balanceHistory.date],
                set: { balance: accountFields.currentBalance },
              });
          }

          accountCount++;
        }
      }
    });
  } catch (e: unknown) {
    console.error("SimpleFIN confirm failed:", e);
    return { success: false, error: e instanceof Error ? e.message : "Failed to finalize SimpleFIN accounts" };
  }

  const connectionIds = connectionGroups.map((g) => g.connectionId);
  for (const connectionId of connectionIds) {
    try {
      await syncConnection(connectionId, householdId, db);
    } catch (err) {
      console.error("[simplefin] Auto-sync after confirm failed:", err);
    }
  }

  return { success: true, accountCount, connectionIds };
}

export async function confirmSimplefinAccounts(connectionGroups: ConnectionClassification[]) {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;

  const result = await confirmSimplefinAccountsDirect(connectionGroups, auth.householdId);
  if (result.success) {
    revalidatePath("/");
    revalidatePath("/accounts");
    revalidatePath("/transactions");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

export async function disconnectSimplefinConnectionDirect(
  connectionId: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const scoped = scopedQuery(householdId, db);

  const [connection] = await db
    .select({ id: bankConnections.id })
    .from(bankConnections)
    .where(scoped.where(bankConnections, eq(bankConnections.id, connectionId)))
    .limit(1);

  if (!connection) {
    return { error: "Connection not found" };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(accounts)
      .set({ deletedAt: now, bankConnectionId: null })
      .where(eq(accounts.bankConnectionId, connectionId));

    await tx.delete(bankConnections).where(eq(bankConnections.id, connectionId));
  });

  return {
    success: true,
    // SimpleFIN has no revoke API — disconnecting here only stops Ledgr from
    // syncing; the user must also revoke access on their SimpleFIN Bridge.
    note: "Disconnected. To fully revoke access, remove this connection from your SimpleFIN Bridge as well.",
  };
}

export async function disconnectSimplefinConnection(connectionId: string) {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;

  const result = await disconnectSimplefinConnectionDirect(connectionId, auth.householdId);
  if ("success" in result && result.success) {
    revalidatePath("/accounts");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Reconnect (replaces Plaid's Link "update mode" — no client SDK involved)
// ---------------------------------------------------------------------------

export async function reconnectSimplefinDirect(
  connectionId: string,
  setupToken: string,
  householdId: string,
  db: LedgrDb = defaultDb,
) {
  const scoped = scopedQuery(householdId, db);

  const [connection] = await db
    .select({ id: bankConnections.id })
    .from(bankConnections)
    .where(scoped.where(bankConnections, eq(bankConnections.id, connectionId)))
    .limit(1);

  if (!connection) {
    return { error: "Connection not found" };
  }

  let accessUrl: string;
  try {
    accessUrl = await claimSetupToken(setupToken);
  } catch (e: unknown) {
    return { error: e instanceof SimplefinHttpError ? e.message : "Failed to claim SimpleFIN Setup Token" };
  }

  await db.update(bankConnections)
    .set({ credential: encrypt(accessUrl), status: "active", errorCode: null, updatedAt: new Date() })
    .where(eq(bankConnections.id, connectionId));

  try {
    await syncConnection(connectionId, householdId, db);
  } catch (err) {
    console.error("[simplefin] Auto-sync after reconnect failed:", err);
  }

  return { success: true };
}

export async function reconnectSimplefin(connectionId: string, setupToken: string) {
  const auth = await authorizeAction();
  if ("error" in auth) return auth;

  const result = await reconnectSimplefinDirect(connectionId, setupToken, auth.householdId);
  if ("success" in result && result.success) {
    revalidatePath("/accounts");
  }
  return result;
}
