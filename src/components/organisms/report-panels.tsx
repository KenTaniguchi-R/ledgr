import { withHousehold } from "@/lib/household-context";
import {
  getSpendingByCategory,
  getIncomeVsExpense,
  getIncomeExpenseByCategory,
  getCategoryTrends,
  getReportNetWorthHistory,
  getCashFlowSankey,
  getSafeToSpend,
  countAccountsStartingAfter,
  type ReportFilters,
} from "@/queries/reports";
import type { CategoryColorMap } from "@/lib/category-colors";
import type { CategoryGroup } from "@/queries/categories";
import { ReportSpending } from "@/components/organisms/report-spending";
import { ReportIncomeExpense } from "@/components/organisms/report-income-expense";
import { ReportCashFlow } from "@/components/organisms/report-cash-flow";
import { ReportTrends } from "@/components/organisms/report-trends";
import { ReportNetWorth } from "@/components/organisms/report-net-worth";

export type ReportTab = "spending" | "income-expense" | "cash-flow" | "trends" | "net-worth";

/** Everything a panel needs to fetch and render its tab, resolved once by the page. */
export interface ReportContext {
  householdId: string;
  /**
   * The range the figures are computed over. Passed down rather than re-read
   * from the URL, so a drill-down can never query a different period than the
   * row that opened it — on a bare `/reports` the URL carries no dates at all.
   */
  filters: ReportFilters;
  /** The preceding period of the same length; absent for all-time. */
  compPeriod?: { dateFrom: string; dateTo: string };
  /** Every category group, for editing transactions from a drill-down. */
  categories: CategoryGroup[];
  /** e.g. "vs Mar 22 – Jun 22"; null for all-time. */
  compLabel: string | null;
  /** One colour per category, shared by every tab. See lib/category-colors.ts. */
  categoryColors: CategoryColorMap;
}

// Each panel is an async server component that fetches only its own tab's
// data. The page renders exactly one of them inside a Suspense boundary, so
// the chart libraries of the other tabs never reach the client, and the
// summary figures and tables render on the server instead of waiting on a
// client-only chunk.

async function SpendingPanel({ ctx }: { ctx: ReportContext }) {
  const { householdId, filters, compPeriod } = ctx;
  const [spending, income, coverage] = await Promise.all([
    withHousehold(householdId, (tx) => getSpendingByCategory(householdId, filters, tx, compPeriod)),
    withHousehold(householdId, (tx) => getIncomeVsExpense(householdId, filters, tx)),
    compPeriod
      ? withHousehold(householdId, (tx) =>
          countAccountsStartingAfter(householdId, compPeriod.dateFrom, filters.accountIds, tx))
      : null,
  ]);
  return (
    <ReportSpending
      data={spending}
      comparisonLabel={ctx.compLabel}
      totalIncome={income.reduce((s, r) => s + r.income, 0)}
      comparisonCoverage={coverage && compPeriod ? { ...coverage, since: compPeriod.dateFrom } : undefined}
      categoryColors={ctx.categoryColors}
      dateFrom={filters.dateFrom}
      dateTo={filters.dateTo}
      accountIds={filters.accountIds}
      categories={ctx.categories}
    />
  );
}

async function IncomeExpensePanel({ ctx }: { ctx: ReportContext }) {
  const { householdId, filters } = ctx;
  const [monthly, byCategory] = await Promise.all([
    withHousehold(householdId, (tx) => getIncomeVsExpense(householdId, filters, tx)),
    withHousehold(householdId, (tx) => getIncomeExpenseByCategory(householdId, filters, tx)),
  ]);
  return (
    <ReportIncomeExpense
      data={monthly}
      categoryData={byCategory}
      dateFrom={filters.dateFrom}
      dateTo={filters.dateTo}
      accountIds={filters.accountIds}
      categories={ctx.categories}
    />
  );
}

async function CashFlowPanel({ ctx }: { ctx: ReportContext }) {
  const { householdId, filters } = ctx;
  const [sankey, safeToSpend, monthly] = await Promise.all([
    withHousehold(householdId, (tx) => getCashFlowSankey(householdId, filters, tx)),
    withHousehold(householdId, (tx) => getSafeToSpend(householdId, tx)),
    withHousehold(householdId, (tx) => getIncomeVsExpense(householdId, filters, tx)),
  ]);
  return (
    <ReportCashFlow
      sankeyNodes={sankey.nodes}
      sankeyLinks={sankey.links}
      barData={monthly}
      safeToSpend={safeToSpend}
      categoryColors={ctx.categoryColors}
      dateFrom={filters.dateFrom}
      dateTo={filters.dateTo}
      accountIds={filters.accountIds}
      categories={ctx.categories}
    />
  );
}

async function TrendsPanel({ ctx }: { ctx: ReportContext }) {
  const { householdId, filters } = ctx;
  const data = await withHousehold(householdId, (tx) => getCategoryTrends(householdId, filters, tx));
  return (
    <ReportTrends
      data={data}
      categoryColors={ctx.categoryColors}
      dateFrom={filters.dateFrom}
      dateTo={filters.dateTo}
    />
  );
}

async function NetWorthPanel({ ctx }: { ctx: ReportContext }) {
  const data = await getReportNetWorthHistory(ctx.householdId, ctx.filters);
  return <ReportNetWorth data={data} />;
}

export function ReportPanel({ tab, ctx }: { tab: ReportTab; ctx: ReportContext }) {
  switch (tab) {
    case "spending":
      return <SpendingPanel ctx={ctx} />;
    case "income-expense":
      return <IncomeExpensePanel ctx={ctx} />;
    case "cash-flow":
      return <CashFlowPanel ctx={ctx} />;
    case "trends":
      return <TrendsPanel ctx={ctx} />;
    case "net-worth":
      return <NetWorthPanel ctx={ctx} />;
  }
}
