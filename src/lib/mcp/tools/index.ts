import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AccessTokenClaims } from "../auth/token";
import { registerAccountTools } from "./accounts";
import { registerDashboardTools } from "./dashboard";
import { registerTransactionTools } from "./transactions";
import { registerBudgetReadTools, registerBudgetWriteTools } from "./budgets";
import { registerReportTools } from "./reports";
import { registerRecurringTools } from "./recurring";
import { registerInvestmentTools } from "./investments";
import { registerCategoryReadTools, registerCategoryWriteTools } from "./categories";
import { registerSyncTools } from "./sync";

export function registerAllTools(server: McpServer, claims: AccessTokenClaims) {
  const householdId = claims.household_id;
  const scopes = claims.scope.split(" ");

  if (scopes.includes("ledgr:read")) {
    registerAccountTools(server, householdId);
    registerDashboardTools(server, householdId);
    registerTransactionTools(server, householdId);
    registerBudgetReadTools(server, householdId);
    registerReportTools(server, householdId);
    registerRecurringTools(server, householdId);
    registerInvestmentTools(server, householdId);
    registerCategoryReadTools(server, householdId);
  }

  if (scopes.includes("ledgr:write")) {
    registerCategoryWriteTools(server, householdId);
    registerBudgetWriteTools(server, householdId);
  }

  if (scopes.includes("ledgr:sync")) {
    registerSyncTools(server, householdId);
  }
}
