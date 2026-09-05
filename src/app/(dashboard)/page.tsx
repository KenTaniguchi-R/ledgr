import { getHouseholdId } from "@/lib/auth/session";
import { withHousehold } from "@/lib/household-context";
import {
  getDashboardSummary,
  getNetWorthHistory,
  getMonthlySpending,
  getCashFlow,
  getRecentTransactions,
  getInvestmentsSummary,
  getLatestActivityMonth,
  getFullCoverageSince,
} from "@/queries/dashboard";
import { getAccountsByInstitution } from "@/queries/accounts";
import { getBudgetForMonth } from "@/queries/budgets";
import { getUpcomingBills } from "@/queries/recurring";
import { getTransactionSummary, getSuggestedTransferCount } from "@/queries/transactions";
import { getCurrentMonth, shiftMonth, formatMonthLong } from "@/lib/date-utils";
import { uncategorizedShare } from "@/lib/uncategorized-share";
import { budgetPace } from "@/lib/budget-pace";
import { rangeSupport } from "@/lib/net-worth-range";
import { ReviewNudge } from "@/components/molecules/review-nudge";
import { TransferReviewNudge } from "@/components/molecules/transfer-review-nudge";
import { getLayoutForUser } from "@/queries/dashboard-layout";
import { getDefaultLayout } from "@/components/organisms/widgets/registry";
import { getSession } from "@/lib/auth/session";
import { DashboardGridLoader } from "@/components/organisms/dashboard-grid-loader";
import { NetWorthHero } from "@/components/organisms/net-worth-hero";
import { DashboardStatRow } from "@/components/molecules/dashboard-stat-row";
import type { DashboardData } from "@/components/organisms/dashboard-grid";

export default async function DashboardPage() {
  const [session, householdId] = await Promise.all([getSession(), getHouseholdId()]);

  // Resolve the effective month once — getDashboardSummary and getMonthlySpending
  // otherwise each re-run this same "latest activity month" lookup. The Spending
  // widget's initial month must match what getMonthlySpending resolved to, so a
  // returning user whose latest data is from an earlier month doesn't open on an
  // empty current month.
  const [latestActivityMonth, fullCoverageSince] = await Promise.all([
    withHousehold(householdId, (tx) => getLatestActivityMonth(householdId, tx)),
    getFullCoverageSince(householdId),
  ]);
  const spendingMonth = latestActivityMonth ?? getCurrentMonth();
  const prevMonth = shiftMonth(spendingMonth, -1);

  // Load the range the hero will actually open on. Hard-coding 6M meant a
  // household whose history starts recently got six months of chart to hold a
  // couple of days of net worth — almost all of it hatched. See
  // lib/net-worth-range.
  const heroRange =
    rangeSupport(fullCoverageSince, new Date()).find((r) => r.recommended)?.range ?? "1M";

  const [summary, prevSummary, netWorthHistory, monthlySpending, cashFlow, recentTransactions, accountGroups, budgetData, upcomingBills, investmentsData, savedLayout, unreviewedSummary, suggestedTransferCount] =
    await Promise.all([
      withHousehold(householdId, (tx) => getDashboardSummary(householdId, spendingMonth, tx)),
      withHousehold(householdId, (tx) => getDashboardSummary(householdId, prevMonth, tx)),
      getNetWorthHistory(householdId, heroRange === "All" ? "all" : heroRange),
      withHousehold(householdId, (tx) => getMonthlySpending(householdId, spendingMonth, tx)),
      withHousehold(householdId, (tx) => getCashFlow(householdId, 6, tx)),
      withHousehold(householdId, (tx) => getRecentTransactions(householdId, 5, tx)),
      getAccountsByInstitution(householdId),
      withHousehold(householdId, (tx) => getBudgetForMonth(householdId, getCurrentMonth(), tx)),
      getUpcomingBills(householdId, { limit: 5 }),
      getInvestmentsSummary(householdId),
      session ? getLayoutForUser(session.user.id) : null,
      withHousehold(householdId, (tx) => getTransactionSummary(householdId, { reviewed: false }, tx)),
      withHousehold(householdId, (tx) => getSuggestedTransferCount(householdId, tx)),
    ]);

  // Flattened from the institution grouping so the balances widget can show the
  // same bank marks the accounts page does, rather than falling back to generic
  // type glyphs for accounts it has a logo for.
  const accounts = accountGroups.flatMap((group) =>
    group.accounts
      .filter((a) => !a.isHidden)
      .map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currentBalance: a.currentBalance,
        currency: a.currency,
        institutionName: group.institutionName,
        logoBase64: group.logoBase64,
        primaryColor: group.primaryColor,
      })),
  );

  // The Spending tile reports `spendingMonth`, which is the latest month with
  // activity and is not always the current one. `budgetData` is fetched for the
  // current month for the budget widget, so it can only anchor the tile when
  // the two agree — otherwise the tile would measure August's spend against
  // September's budget, which is worse than showing no budget at all.
  const spendingMonthBudget =
    spendingMonth === getCurrentMonth()
      ? budgetData
      : await withHousehold(householdId, (tx) => getBudgetForMonth(householdId, spendingMonth, tx));

  const pace = budgetPace({
    totalBudgeted: spendingMonthBudget?.summary.totalBudgeted ?? 0,
    totalSpent: summary.monthlyExpenses,
    month: spendingMonth,
    asOf: new Date(),
  });

  const layout = savedLayout ?? getDefaultLayout();

  const data: DashboardData = {
    monthlySpending,
    spendingMonth,
    cashFlow,
    recentTransactions,
    accounts,
    budgetData,
    upcomingBills,
    investmentsData,
  };

  return (
    <div>
      {/* Was sr-only. A screen-reader-only title means sighted users navigate a
          page whose name they cannot see, and it left the page opening on an
          unlabelled number. */}
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Dashboard</h1>
      <ReviewNudge
        unreviewedCount={unreviewedSummary.count}
        share={uncategorizedShare(monthlySpending)}
        monthLabel={formatMonthLong(spendingMonth)}
      />
      <TransferReviewNudge suggestedCount={suggestedTransferCount} />
      <NetWorthHero
        netWorth={summary.netWorth}
        initialHistory={netWorthHistory}
        initialRange={heroRange}
        fullCoverageSince={fullCoverageSince}
      />
      <DashboardStatRow
        summary={summary}
        prevSummary={prevSummary}
        month={spendingMonth}
        prevMonth={prevMonth}
        pace={pace}
      />
      <DashboardGridLoader layout={layout} data={data} />
    </div>
  );
}
