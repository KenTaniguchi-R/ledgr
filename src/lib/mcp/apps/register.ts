import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { z } from "zod";
import { centsToDisplay } from "@/lib/money";
import { getCurrentMonth, monthBounds, formatMonthLong, todayDateString } from "@/lib/date-utils";
import { getMonthlySpending } from "@/queries/dashboard";
import { getNetWorthHistory } from "@/queries/dashboard";
import { getTransactions } from "@/queries/transactions";
import { getBudgetForMonth } from "@/queries/budgets";

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

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

export function registerAppTools(server: McpServer, householdId: string) {
  // Register widget HTML files as MCP resources
  for (const name of WIDGET_NAMES) {
    const uri = `ui://ledgr/${name}`;
    server.registerResource(
      `ledgr-widget-${name}`,
      uri,
      {
        description: `Ledgr ${name} interactive widget HTML`,
        mimeType: "text/html",
      },
      async () => {
        const html = loadWidgetHtml(name);
        return {
          contents: [{ uri, text: html, mimeType: "text/html" }],
        };
      },
    );
  }

  // Register the show_financial_dashboard tool
  server.registerTool(
    "show_financial_dashboard",
    {
      title: "Show Financial Dashboard",
      description:
        "Show an interactive financial dashboard widget. Choose a view: spending-breakdown (pie chart of spending by category), transaction-table (sortable table of recent transactions), budget-progress (budget category progress bars), or net-worth-trend (area chart of net worth over time).",
      inputSchema: {
        view: z
          .enum([
            "spending-breakdown",
            "transaction-table",
            "budget-progress",
            "net-worth-trend",
          ])
          .describe("Which dashboard widget to display"),
        month: z
          .string()
          .optional()
          .describe("Month in YYYY-MM format (defaults to current month, used by spending-breakdown and budget-progress)"),
        range: z
          .enum(["1M", "3M", "6M", "1Y", "all"])
          .optional()
          .describe("Time range for net-worth-trend (defaults to 6M)"),
        limit: z
          .number()
          .optional()
          .describe("Number of transactions to show for transaction-table (defaults to 25)"),
      },
      annotations: READ_ANNOTATIONS,
    },
    async ({ view, month, range, limit }) => {
      const widgetHtml = loadWidgetHtml(view);

      switch (view) {
        case "spending-breakdown": {
          const targetMonth = month ?? getCurrentMonth();
          const spending = getMonthlySpending(householdId, targetMonth);
          const totalCents = spending.reduce((s, r) => s + r.total, 0);

          const categories = spending.map((r) => ({
            name: r.categoryName,
            amountCents: r.total,
            amountDisplay: centsToDisplay(r.total),
            percentage: totalCents > 0 ? Math.round((r.total / totalCents) * 100) : 0,
          }));

          const data = {
            categories,
            period: formatMonthLong(targetMonth),
            totalDisplay: centsToDisplay(totalCents),
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(data, null, 2),
              },
            ],
            structuredContent: {
              type: "app" as const,
              html: widgetHtml,
              data,
            },
          };
        }

        case "transaction-table": {
          const txnLimit = limit ?? 25;
          const page = getTransactions(householdId, {}, txnLimit);

          const txnRows = page.rows.map((r) => ({
            date: r.date,
            name: r.name,
            merchant: r.merchantName,
            category: r.categoryName,
            amountCents: Math.abs(r.normalizedAmount),
            amountDisplay: centsToDisplay(Math.abs(r.normalizedAmount)),
            isIncome: r.normalizedAmount > 0,
          }));

          const data = {
            transactions: txnRows,
            totalCount: txnRows.length + (page.nextCursor ? 1 : 0),
            page: 1,
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { transactionCount: txnRows.length, hasMore: !!page.nextCursor },
                  null,
                  2,
                ),
              },
            ],
            structuredContent: {
              type: "app" as const,
              html: widgetHtml,
              data,
            },
          };
        }

        case "budget-progress": {
          const targetMonth = month ?? getCurrentMonth();
          const budget = getBudgetForMonth(householdId, targetMonth);

          const allCategories = budget.groups.flatMap((g) =>
            g.categories.map((c) => ({
              name: c.categoryName,
              allocatedCents: c.limitAmount,
              spentCents: c.spent,
              allocatedDisplay: centsToDisplay(c.limitAmount),
              spentDisplay: centsToDisplay(c.spent),
              percentUsed: c.limitAmount > 0 ? Math.round((c.spent / c.limitAmount) * 100) : 0,
            })),
          );

          // Calculate days remaining in month
          const { to: lastDay } = monthBounds(targetMonth);
          const today = todayDateString();
          const endDate = new Date(lastDay + "T23:59:59");
          const todayDate = new Date(today + "T00:00:00");
          const daysRemaining = Math.max(
            0,
            Math.ceil((endDate.getTime() - todayDate.getTime()) / 86400000),
          );

          const data = {
            month: formatMonthLong(targetMonth),
            categories: allCategories,
            totalAllocatedDisplay: centsToDisplay(budget.summary.totalBudgeted),
            totalSpentDisplay: centsToDisplay(budget.summary.totalSpent),
            daysRemaining,
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    month: targetMonth,
                    totalBudgeted: centsToDisplay(budget.summary.totalBudgeted),
                    totalSpent: centsToDisplay(budget.summary.totalSpent),
                    remaining: centsToDisplay(budget.summary.totalRemaining),
                    categoryCount: allCategories.length,
                    daysRemaining,
                  },
                  null,
                  2,
                ),
              },
            ],
            structuredContent: {
              type: "app" as const,
              html: widgetHtml,
              data,
            },
          };
        }

        case "net-worth-trend": {
          const timeRange = range ?? "6M";
          const points = getNetWorthHistory(householdId, timeRange);

          const formattedPoints = points.map((p) => ({
            date: p.date,
            assetsCents: p.assets,
            liabilitiesCents: p.liabilities,
            netWorthCents: p.netWorth,
            assetsDisplay: centsToDisplay(p.assets),
            liabilitiesDisplay: centsToDisplay(p.liabilities),
            netWorthDisplay: centsToDisplay(p.netWorth),
          }));

          const current = points.length > 0 ? points[points.length - 1] : null;
          const first = points.length > 0 ? points[0] : null;
          const changeCents = current && first ? current.netWorth - first.netWorth : 0;
          const changePercent =
            first && first.netWorth !== 0
              ? (changeCents / Math.abs(first.netWorth)) * 100
              : 0;

          const data = {
            points: formattedPoints,
            currentNetWorthDisplay: current ? centsToDisplay(current.netWorth) : "$0.00",
            changeDisplay: centsToDisplay(changeCents),
            changePercent,
          };

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    currentNetWorth: data.currentNetWorthDisplay,
                    change: data.changeDisplay,
                    changePercent: `${changePercent.toFixed(1)}%`,
                    dataPoints: formattedPoints.length,
                    range: timeRange,
                  },
                  null,
                  2,
                ),
              },
            ],
            structuredContent: {
              type: "app" as const,
              html: widgetHtml,
              data,
            },
          };
        }
      }
    },
  );
}
