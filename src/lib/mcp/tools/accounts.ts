import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAccounts, getAccountSummary } from "@/queries/accounts";
import { centsToDisplay } from "@/lib/money";

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

export function registerAccountTools(server: McpServer, householdId: string) {
  server.registerTool(
    "list_accounts",
    {
      title: "List Accounts",
      description: "List all accounts in the household, sorted by type and name.",
      inputSchema: {},
      annotations: READ_ANNOTATIONS,
    },
    async () => {
      const accounts = getAccounts(householdId);
      const result = accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        isHidden: a.isHidden,
        currentBalanceCents: a.currentBalance,
        currentBalanceDisplay: a.currentBalance !== null
          ? centsToDisplay(a.currentBalance, a.currency ?? "USD")
          : null,
        availableBalanceCents: a.availableBalance,
        availableBalanceDisplay: a.availableBalance !== null
          ? centsToDisplay(a.availableBalance, a.currency ?? "USD")
          : null,
        currency: a.currency,
        plaidItemId: a.plaidItemId,
      }));
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_account_summary",
    {
      title: "Get Account Summary",
      description: "Get total assets, total liabilities, and net worth for the household.",
      inputSchema: {},
      annotations: READ_ANNOTATIONS,
    },
    async () => {
      const summary = getAccountSummary(householdId);
      const result = {
        totalAssetsCents: summary.totalAssets,
        totalAssetsDisplay: centsToDisplay(summary.totalAssets),
        totalLiabilitiesCents: summary.totalLiabilities,
        totalLiabilitiesDisplay: centsToDisplay(summary.totalLiabilities),
        netWorthCents: summary.netWorth,
        netWorthDisplay: centsToDisplay(summary.netWorth),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
