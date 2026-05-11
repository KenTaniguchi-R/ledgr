import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/db";
import { plaidItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { scopedQuery } from "@/lib/scoped-query";
import { syncInstitution } from "@/lib/plaid/sync";
import { checkSyncRateLimit } from "../rate-limit";
import { SYNC_ANNOTATIONS } from "../constants";
import { jsonResult } from "../tool-result";

export function registerSyncTools(server: McpServer, householdId: string) {
  server.registerTool(
    "sync_accounts",
    {
      title: "Sync Accounts",
      description:
        "Trigger a Plaid sync for all connected institutions in the household. Rate-limited to once per minute per institution.",
      inputSchema: {},
      annotations: SYNC_ANNOTATIONS,
    },
    async () => {
      const scoped = scopedQuery(householdId, db);

      const items = db
        .select({ id: plaidItems.id, institutionName: plaidItems.institutionName, status: plaidItems.status })
        .from(plaidItems)
        .where(scoped.where(plaidItems, eq(plaidItems.status, "active")))
        .all();

      const results: Array<{
        itemId: string;
        institutionName: string | null;
        status: string;
        rateLimited?: boolean;
        retryAfterSeconds?: number;
        error?: string;
      }> = [];

      for (const item of items) {
        const rateCheck = checkSyncRateLimit(item.id, db);

        if (!rateCheck.allowed) {
          results.push({
            itemId: item.id,
            institutionName: item.institutionName,
            status: "rate_limited",
            rateLimited: true,
            retryAfterSeconds: rateCheck.retryAfterSeconds,
          });
          continue;
        }

        try {
          const syncResult = await syncInstitution(item.id, householdId, db);
          results.push({
            itemId: item.id,
            institutionName: item.institutionName,
            status: "success",
            ...syncResult,
          });
        } catch (err) {
          results.push({
            itemId: item.id,
            institutionName: item.institutionName,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return jsonResult({ synced: results });
    },
  );
}
