import { eq } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { userSettings } from "@/db/schema";
import { getConsentsForUser } from "@/lib/mcp/auth/oauth-server";

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

export async function getMcpSettings(
  userId: string,
  db: LedgrDb = defaultDb,
): Promise<McpSettings> {
  const [row] = await db
    .select({ mcpEnabled: userSettings.mcpEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  const consents = await getConsentsForUser(userId, db);

  return {
    mcpEnabled: row?.mcpEnabled === true,
    connectedClients: consents.map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName ?? null,
      scope: c.scope,
      grantedAt: c.grantedAt,
    })),
  };
}
