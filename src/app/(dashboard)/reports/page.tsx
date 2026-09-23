import { getHouseholdId } from "@/lib/auth/session";
import { withHousehold } from "@/lib/household-context";
import { getCategories } from "@/queries/categories";
import { getReportFilterAccounts } from "@/queries/accounts";
import { Suspense } from "react";
import type { ReportFilters } from "@/queries/reports";
import { aggregateSpending } from "@/lib/spending-helpers";
import { buildCategoryColorMap } from "@/lib/category-colors";
import { rangeToDateBounds, shiftDateRange, comparisonLabel } from "@/lib/date-utils";
import { resolveReportDateSelection, DEFAULT_REPORT_PRESET } from "@/lib/report-date-selection";
import { ReportFilterBar } from "@/components/organisms/report-filter-bar";
import { ReportTabs } from "@/components/organisms/report-tabs";
import { ReportPanel, type ReportContext, type ReportTab } from "@/components/organisms/report-panels";
import { ReportPanelSkeleton } from "@/components/organisms/report-panel-skeleton";
import { SavedReportPicker } from "@/components/organisms/saved-report-picker";
import { getSavedReportsByHousehold } from "@/queries/saved-reports";

const VALID_TABS = new Set<string>(["spending", "income-expense", "cash-flow", "trends", "net-worth"]);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;

  const tab: ReportTab =
    typeof params.tab === "string" && VALID_TABS.has(params.tab) ? (params.tab as ReportTab) : "spending";
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

  const [allCategories, filterAccounts, savedReports, rangeSpending] = await Promise.all([
    getCategories(householdId),
    getReportFilterAccounts(householdId),
    getSavedReportsByHousehold(householdId),
    // One spend ranking for the range colours every tab, so a category keeps
    // its colour from Spending to Cash Flow to Trends.
    withHousehold(householdId, (tx) => aggregateSpending(householdId, filters, tx)),
  ]);

  const ctx: ReportContext = {
    householdId,
    filters,
    compPeriod,
    compLabel,
    categories: allCategories,
    categoryColors: buildCategoryColorMap(rangeSpending),
  };

  // Keyed on the tab and every filter, so any change streams a fresh panel
  // behind the skeleton instead of leaving stale figures under new filters.
  const panelKey = [tab, dateFrom, dateTo, accountIds?.join(","), categoryIds?.join(",")].join("|");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>

      <div className="flex items-start justify-between gap-2">
        <ReportFilterBar accounts={filterAccounts} categories={allCategories} />
        <SavedReportPicker reports={savedReports} activeTab={tab} />
      </div>

      <ReportTabs activeTab={tab}>
        <Suspense key={panelKey} fallback={<ReportPanelSkeleton />}>
          <ReportPanel tab={tab} ctx={ctx} />
        </Suspense>
      </ReportTabs>
    </div>
  );
}
