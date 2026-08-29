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
import { getAccounts } from "@/queries/accounts";
import { getBudgetForMonth } from "@/queries/budgets";
import { getUpcomingBills } from "@/queries/recurring";
import { getCurrentMonth, shiftMonth } from "@/lib/date-utils";
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

  const [summary, prevSummary, netWorthHistory, monthlySpending, cashFlow, recentTransactions, allAccounts, budgetData, upcomingBills, investmentsData, savedLayout] =
    await Promise.all([
      withHousehold(householdId, (tx) => getDashboardSummary(householdId, spendingMonth, tx)),
      withHousehold(householdId, (tx) => getDashboardSummary(householdId, prevMonth, tx)),
      getNetWorthHistory(householdId, "6M"),
      withHousehold(householdId, (tx) => getMonthlySpending(householdId, spendingMonth, tx)),
      withHousehold(householdId, (tx) => getCashFlow(householdId, 6, tx)),
      withHousehold(householdId, (tx) => getRecentTransactions(householdId, 5, tx)),
      getAccounts(householdId),
      withHousehold(householdId, (tx) => getBudgetForMonth(householdId, getCurrentMonth(), tx)),
      getUpcomingBills(householdId, { limit: 5 }),
      getInvestmentsSummary(householdId),
      session ? getLayoutForUser(session.user.id) : null,
    ]);

  const accounts = allAccounts
    .filter((a) => !a.isHidden)
    .map((a) => ({ id: a.id, name: a.name, type: a.type, currentBalance: a.currentBalance, currency: a.currency }));

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
      <h1 className="sr-only">Dashboard</h1>
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
