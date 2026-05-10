import { getHouseholdId } from "@/lib/auth/session";
import { getCategories } from "@/queries/categories";
import { getAccounts } from "@/queries/accounts";
import {
  getSpendingByCategory,
  getIncomeVsExpense,
  getIncomeExpenseByCategory,
  getCategoryTrends,
  getReportNetWorthHistory,
  type ReportFilters,
} from "@/queries/reports";
import { rangeToDateBounds, shiftDateRange, comparisonLabel } from "@/lib/date-utils";
import { ReportFilterBar } from "@/components/molecules/report-filter-bar";
import { ReportTabs } from "@/components/organisms/report-tabs";
import { SavedReportPicker } from "@/components/organisms/saved-report-picker";
import { getSavedReportsByHousehold } from "@/queries/saved-reports";

const VALID_TABS = new Set(["spending", "income-expense", "trends", "net-worth"]);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;

  const tab = typeof params.tab === "string" && VALID_TABS.has(params.tab) ? params.tab : "spending";
  const preset = typeof params.preset === "string" ? params.preset : null;

  let dateFrom: string;
  let dateTo: string;

  if (typeof params.from === "string" && typeof params.to === "string") {
    dateFrom = params.from;
    dateTo = params.to;
  } else {
    const bounds = rangeToDateBounds(preset ?? "3M");
    dateFrom = bounds.from ?? "2000-01-01";
    dateTo = bounds.to;
  }

  const accountIds = typeof params.accounts === "string" ? params.accounts.split(",").filter(Boolean) : undefined;
  const categoryIds = typeof params.categories === "string" ? params.categories.split(",").filter(Boolean) : undefined;

  const filters: ReportFilters = { dateFrom, dateTo, accountIds, categoryIds };

  // Comparison period
  const isPreset = preset !== null;
  const isAllTime = preset === "all" || (!params.from && !params.to && !preset);
  let compLabel: string | null = null;
  let compPeriod: { dateFrom: string; dateTo: string } | undefined;

  if (!isAllTime) {
    const shifted = shiftDateRange(dateFrom, dateTo, "back", isPreset);
    compPeriod = { dateFrom: shifted.from, dateTo: shifted.to };
    compLabel = comparisonLabel(shifted.from, shifted.to);
  }

  // Only fetch data for active tab
  let spendingData;
  let incomeExpenseData;
  let incomeExpenseCategoryData;
  let trendsData;
  let netWorthData;

  switch (tab) {
    case "spending":
      spendingData = getSpendingByCategory(householdId, filters, undefined, compPeriod);
      break;
    case "income-expense":
      incomeExpenseData = getIncomeVsExpense(householdId, filters);
      incomeExpenseCategoryData = getIncomeExpenseByCategory(householdId, filters);
      break;
    case "trends":
      trendsData = getCategoryTrends(householdId, filters);
      break;
    case "net-worth":
      netWorthData = getReportNetWorthHistory(householdId, filters);
      break;
  }

  const allCategories = getCategories(householdId);
  const allAccounts = getAccounts(householdId);
  const accountOptions = allAccounts.map((a) => ({ id: a.id, name: a.name }));
  const savedReports = getSavedReportsByHousehold(householdId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>

      <div className="flex items-start justify-between gap-2">
        <ReportFilterBar accounts={accountOptions} categories={allCategories} />
        <SavedReportPicker reports={savedReports} activeTab={tab} />
      </div>

      <ReportTabs
        activeTab={tab}
        spendingData={spendingData}
        incomeExpenseData={incomeExpenseData}
        incomeExpenseCategoryData={incomeExpenseCategoryData}
        trendsData={trendsData}
        netWorthData={netWorthData}
        comparisonLabel={compLabel}
      />
    </div>
  );
}
