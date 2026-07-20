import { db as defaultDb, type LedgrDb } from "@/db";
import { getMcpSettings } from "@/queries/mcp-settings";

export async function assertMcpEnabled(userId: string, db: LedgrDb = defaultDb): Promise<void> {
  const settings = await getMcpSettings(userId, db);
  if (!settings.mcpEnabled) {
    throw new Error("MCP access is not enabled for this account");
  }
}
