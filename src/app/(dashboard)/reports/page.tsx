import { getHouseholdId } from "@/lib/auth/session";
import { withHousehold } from "@/lib/household-context";
import { getCategories } from "@/queries/categories";
import { getReportFilterAccounts } from "@/queries/accounts";
import {
  getSpendingByCategory,
  getIncomeVsExpense,
  getIncomeExpenseByCategory,
  getCategoryTrends,
  getReportNetWorthHistory,
  getCashFlowSankey,
  getSafeToSpend,
  type ReportFilters,
} from "@/queries/reports";
import { rangeToDateBounds, shiftDateRange, comparisonLabel, getCurrentMonth } from "@/lib/date-utils";
import { resolveReportDateSelection, DEFAULT_REPORT_PRESET } from "@/lib/report-date-selection";
import { ReportFilterBar } from "@/components/organisms/report-filter-bar";
import { ReportTabs } from "@/components/organisms/report-tabs";
import { SavedReportPicker } from "@/components/organisms/saved-report-picker";
import { getSavedReportsByHousehold } from "@/queries/saved-reports";

const VALID_TABS = new Set(["spending", "income-expense", "cash-flow", "trends", "net-worth"]);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;

  const tab = typeof params.tab === "string" && VALID_TABS.has(params.tab) ? params.tab : "spending";
  const preset = typeof params.preset === "string" ? params.preset : null;
  const from = typeof params.from === "string" ? params.from : null;
  const to = typeof params.to === "string" ? params.to : null;

  // Shared with ReportFilterBar so the page and the chip above it can never
  // describe the same URL differently.
  const { effectivePreset, isAllTime, isPreset } = resolveReportDateSelection({ from, to, preset });

  let dateFrom: string;
  let dateTo: string;

  if (from && to) {
    dateFrom = from;
    dateTo = to;
  } else {
    const bounds = rangeToDateBounds(effectivePreset ?? DEFAULT_REPORT_PRESET);
    dateFrom = bounds.from ?? "2000-01-01";
    dateTo = bounds.to;
  }

  const accountIds = typeof params.accounts === "string" ? params.accounts.split(",").filter(Boolean) : undefined;
  const categoryIds = typeof params.categories === "string" ? params.categories.split(",").filter(Boolean) : undefined;

  const filters: ReportFilters = { dateFrom, dateTo, accountIds, categoryIds };

  // Comparison period
  let compLabel: string | null = null;
  let compPeriod: { dateFrom: string; dateTo: string } | undefined;

  if (!isAllTime) {
    const shifted = shiftDateRange(dateFrom, dateTo, "back", isPreset);
    compPeriod = { dateFrom: shifted.from, dateTo: shifted.to };
    compLabel = comparisonLabel(shifted.from, shifted.to);
  }

  // These three are independent of the active tab — kick them off up front so
  // they run concurrently with the tab-specific query below.
  const sharedPromise = Promise.all([
    getCategories(householdId),
    getReportFilterAccounts(householdId),
    getSavedReportsByHousehold(householdId),
  ]);

  // Only fetch data for active tab
  let spendingData;
  let incomeExpenseData;
  let incomeExpenseCategoryData;
  let trendsData;
  let netWorthData;
  let sankeyData;
  let safeToSpendData;
  let cashFlowBarData;

  switch (tab) {
    case "spending":
      spendingData = await withHousehold(householdId, (tx) =>
        getSpendingByCategory(householdId, filters, tx, compPeriod));
      break;
    case "income-expense": {
      const [ie, ieCat] = await Promise.all([
        withHousehold(householdId, (tx) => getIncomeVsExpense(householdId, filters, tx)),
        withHousehold(householdId, (tx) => getIncomeExpenseByCategory(householdId, filters, tx)),
      ]);
      incomeExpenseData = ie;
      incomeExpenseCategoryData = ieCat;
      break;
    }
    case "cash-flow": {
      const [sankey, safeToSpend, cashFlowBar] = await Promise.all([
        withHousehold(householdId, (tx) => getCashFlowSankey(householdId, filters, tx)),
        withHousehold(householdId, (tx) => getSafeToSpend(householdId, tx)),
        withHousehold(householdId, (tx) => getIncomeVsExpense(householdId, filters, tx)),
      ]);
      sankeyData = sankey;
      safeToSpendData = safeToSpend;
      cashFlowBarData = cashFlowBar;
      break;
    }
    case "trends":
      trendsData = await withHousehold(householdId, (tx) => getCategoryTrends(householdId, filters, tx));
      break;
    case "net-worth":
      netWorthData = await getReportNetWorthHistory(householdId, filters);
      break;
  }

  const currentMonth = getCurrentMonth();
  const isCurrentMonth = dateFrom <= `${currentMonth}-01` && dateTo >= `${currentMonth}-01`;

  const [allCategories, filterAccounts, savedReports] = await sharedPromise;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>

      <div className="flex items-start justify-between gap-2">
        <ReportFilterBar accounts={filterAccounts} categories={allCategories} />
        <SavedReportPicker reports={savedReports} activeTab={tab} />
      </div>

      <ReportTabs
        activeTab={tab}
        spendingData={spendingData}
        incomeExpenseData={incomeExpenseData}
        incomeExpenseCategoryData={incomeExpenseCategoryData}
        trendsData={trendsData}
        netWorthData={netWorthData}
        sankeyNodes={sankeyData?.nodes}
        sankeyLinks={sankeyData?.links}
        cashFlowBarData={cashFlowBarData}
        safeToSpendData={safeToSpendData}
        isCurrentMonth={isCurrentMonth}
        comparisonLabel={compLabel}
      />
    </div>
  );
}
