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
} from "@/queries/dashboard";
import { getAccountsByInstitution } from "@/queries/accounts";
import { getBudgetForMonth } from "@/queries/budgets";
import { getUpcomingBills } from "@/queries/recurring";
import { getTransactionSummary } from "@/queries/transactions";
import { getCurrentMonth, shiftMonth, formatMonthLong } from "@/lib/date-utils";
import { uncategorizedShare } from "@/lib/uncategorized-share";
import { ReviewNudge } from "@/components/molecules/review-nudge";
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
  const latestActivityMonth = await withHousehold(householdId, (tx) => getLatestActivityMonth(householdId, tx));
  const spendingMonth = latestActivityMonth ?? getCurrentMonth();
  const prevMonth = shiftMonth(spendingMonth, -1);

  const [summary, prevSummary, netWorthHistory, monthlySpending, cashFlow, recentTransactions, accountGroups, budgetData, upcomingBills, investmentsData, savedLayout, unreviewedSummary] =
    await Promise.all([
      withHousehold(householdId, (tx) => getDashboardSummary(householdId, spendingMonth, tx)),
      withHousehold(householdId, (tx) => getDashboardSummary(householdId, prevMonth, tx)),
      getNetWorthHistory(householdId, "6M"),
      withHousehold(householdId, (tx) => getMonthlySpending(householdId, spendingMonth, tx)),
      withHousehold(householdId, (tx) => getCashFlow(householdId, 6, tx)),
      withHousehold(householdId, (tx) => getRecentTransactions(householdId, 5, tx)),
      getAccountsByInstitution(householdId),
      withHousehold(householdId, (tx) => getBudgetForMonth(householdId, getCurrentMonth(), tx)),
      getUpcomingBills(householdId, { limit: 5 }),
      getInvestmentsSummary(householdId),
      session ? getLayoutForUser(session.user.id) : null,
      withHousehold(householdId, (tx) => getTransactionSummary(householdId, { reviewed: false }, tx)),
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
      <NetWorthHero netWorth={summary.netWorth} initialHistory={netWorthHistory} />
      <DashboardStatRow
        summary={summary}
        prevSummary={prevSummary}
        month={spendingMonth}
        prevMonth={prevMonth}
      />
      <DashboardGridLoader layout={layout} data={data} />
    </div>
  );
}
