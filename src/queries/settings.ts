import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import { nowISO } from "@/lib/date-utils";
import { v4 as uuid } from "uuid";
import { getConsentsForUser } from "@/lib/mcp/auth/oauth-server";

export interface AiSettings {
  aiProvider: "openai" | "anthropic" | "google" | "custom" | null;
  aiModel: string | null;
  hasKey: boolean;
  rawEncryptedKey: string | null;
  aiBaseUrl: string | null;
  aiConfidenceThreshold: number;
  toolCallingSupported: boolean | null;
}

export function getUserAiSettings(
  userId: string,
  db: LedgrDb = defaultDb,
): AiSettings | null {
  const row = db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  if (!row) return null;

  return {
    aiProvider: row.aiProvider as AiSettings["aiProvider"],
    aiModel: row.aiModel,
    hasKey: !!row.aiApiKey,
    rawEncryptedKey: row.aiApiKey,
    aiBaseUrl: row.aiBaseUrl ?? null,
    aiConfidenceThreshold: parseFloat(row.aiConfidenceThreshold ?? "0.7"),
    toolCallingSupported: row.toolCallingSupported ?? null,
  };
}

export interface ConnectedClient {
  clientId: string;
  clientName: string | null;
  scope: string;
  grantedAt: string;
}

export interface McpSettings {
  mcpEnabled: boolean;
  connectedClients: ConnectedClient[];
}

export function getMcpSettings(
  userId: string,
  db: LedgrDb = defaultDb,
): McpSettings {
  const row = db
    .select({ mcpEnabled: userSettings.mcpEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  const consents = getConsentsForUser(userId, db);

  return {
    mcpEnabled: row?.mcpEnabled === 1,
    connectedClients: consents.map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName ?? null,
      scope: c.scope,
      grantedAt: c.grantedAt,
    })),
  };
}

export interface UpsertAiInput {
  aiProvider: string;
  aiModel: string;
  aiApiKey?: string;
  aiBaseUrl?: string;
  aiConfidenceThreshold?: number;
  toolCallingSupported?: boolean;
}

export function upsertAiSettings(
  userId: string,
  input: UpsertAiInput,
  db: LedgrDb = defaultDb,
): void {
  const existing = db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  const now = nowISO();

  if (existing) {
    const updates: Record<string, unknown> = {
      aiProvider: input.aiProvider,
      aiModel: input.aiModel,
      updatedAt: now,
    };
    if (input.aiApiKey !== undefined) updates.aiApiKey = input.aiApiKey;
    if (input.aiBaseUrl !== undefined) updates.aiBaseUrl = input.aiBaseUrl;
    if (input.aiConfidenceThreshold !== undefined)
      updates.aiConfidenceThreshold = String(input.aiConfidenceThreshold);
    if (input.toolCallingSupported !== undefined)
      updates.toolCallingSupported = input.toolCallingSupported;

    db.update(userSettings)
      .set(updates)
      .where(eq(userSettings.id, existing.id))
      .run();
  } else {
    db.insert(userSettings).values({
      id: uuid(),
      userId,
      aiProvider: input.aiProvider as "openai" | "anthropic" | "google" | "custom",
      aiModel: input.aiModel,
      aiApiKey: input.aiApiKey ?? null,
      aiBaseUrl: input.aiBaseUrl ?? null,
      aiConfidenceThreshold: input.aiConfidenceThreshold
        ? String(input.aiConfidenceThreshold)
        : "0.7",
      toolCallingSupported: input.toolCallingSupported ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();
  }
}

export function upsertMcpEnabled(
  userId: string,
  mcpEnabled: boolean,
  db: LedgrDb = defaultDb,
): void {
  const existing = db
    .select({ id: userSettings.id })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .get();

  const now = nowISO();

  if (existing) {
    db.update(userSettings)
      .set({ mcpEnabled: mcpEnabled ? 1 : 0, updatedAt: now })
      .where(eq(userSettings.id, existing.id))
      .run();
  } else {
    db.insert(userSettings).values({
      id: uuid(),
      userId,
      mcpEnabled: mcpEnabled ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    }).run();
  }
}
