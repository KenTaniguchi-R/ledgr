import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { z } from "zod";
import { READ_ANNOTATIONS } from "../constants";
import { spendingBreakdownData, transactionTableData, budgetProgressData, netWorthTrendData } from "./widget-data";

const WIDGET_NAMES = [
  "spending-breakdown",
  "transaction-table",
  "budget-progress",
  "net-worth-trend",
] as const;

type WidgetName = (typeof WIDGET_NAMES)[number];

function loadWidgetHtml(name: WidgetName): string {
  const widgetsDir = resolve(dirname(new URL(import.meta.url).pathname), "widgets");
  return readFileSync(resolve(widgetsDir, `${name}.html`), "utf-8");
}

function appResult(summary: unknown, html: string, data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }],
    structuredContent: { type: "app" as const, html, data },
  };
}

export function registerAppTools(server: McpServer, householdId: string) {
  for (const name of WIDGET_NAMES) {
    const uri = `ui://ledgr/${name}`;
    server.registerResource(
      `ledgr-widget-${name}`,
      uri,
      { description: `Ledgr ${name} interactive widget HTML`, mimeType: "text/html" },
      async () => ({ contents: [{ uri, text: loadWidgetHtml(name), mimeType: "text/html" }] }),
    );
  }

  server.registerTool(
    "show_financial_dashboard",
    {
      title: "Show Financial Dashboard",
      description:
        "Show an interactive financial dashboard widget. Choose a view: spending-breakdown (pie chart of spending by category), transaction-table (sortable table of recent transactions), budget-progress (budget category progress bars), or net-worth-trend (area chart of net worth over time).",
      inputSchema: {
        view: z
          .enum(["spending-breakdown", "transaction-table", "budget-progress", "net-worth-trend"])
          .describe("Which dashboard widget to display"),
        month: z.string().optional().describe("Month in YYYY-MM format (defaults to current month)"),
        range: z.enum(["1M", "3M", "6M", "1Y", "all"]).optional().describe("Time range for net-worth-trend (defaults to 6M)"),
        limit: z.number().optional().describe("Number of transactions for transaction-table (defaults to 25)"),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ view, month, range, limit }) => {
      const html = loadWidgetHtml(view);

      switch (view) {
        case "spending-breakdown": {
          const { data, summary } = spendingBreakdownData(householdId, month);
          return appResult(summary, html, data);
        }
        case "transaction-table": {
          const { data, summary } = transactionTableData(householdId, limit);
          return appResult(summary, html, data);
        }
        case "budget-progress": {
          const { data, summary } = budgetProgressData(householdId, month);
          return appResult(summary, html, data);
        }
        case "net-worth-trend": {
          const { data, summary } = netWorthTrendData(householdId, range);
          return appResult(summary, html, data);
        }
      }
    },
  );
}
