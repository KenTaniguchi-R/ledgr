import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAccounts, getAccountSummary } from "@/queries/accounts";
import { centsToDisplay } from "@/lib/money";
import { READ_ANNOTATIONS } from "../constants";
import { jsonResult } from "../tool-result";

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
      return jsonResult(
        accounts.map((a) => ({
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
        })),
      );
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
      const s = getAccountSummary(householdId);
      return jsonResult({
        totalAssetsCents: s.totalAssets,
        totalAssetsDisplay: centsToDisplay(s.totalAssets),
        totalLiabilitiesCents: s.totalLiabilities,
        totalLiabilitiesDisplay: centsToDisplay(s.totalLiabilities),
        netWorthCents: s.netWorth,
        netWorthDisplay: centsToDisplay(s.netWorth),
      });
    },
  );
}
