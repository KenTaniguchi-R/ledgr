import { getHouseholdId, getSession } from "@/lib/auth/session";
import {
  getDashboardSummary,
  getNetWorthHistory,
  getMonthlySpending,
  getCashFlow,
  getRecentTransactions,
  getInvestmentsSummary,
} from "@/queries/dashboard";
import { getAccounts } from "@/queries/accounts";
import { getBudgetForMonth } from "@/queries/budgets";
import { getUpcomingBills } from "@/queries/recurring";
import { getCurrentMonth } from "@/lib/date-utils";
import { getLayout } from "@/actions/dashboard";
import { getDefaultLayout } from "@/components/organisms/widgets/registry";
import { DashboardGridLoader } from "@/components/organisms/dashboard-grid-loader";
import type { DashboardData } from "@/components/organisms/dashboard-grid";

export default async function DashboardPage() {
  const householdId = await getHouseholdId();
  const session = await getSession();
  const userId = session!.user.id;

  const [summary, netWorthHistory, monthlySpending, cashFlow, recentTransactions, allAccounts, budgetData, upcomingBills, investmentsData] =
    await Promise.all([
      getDashboardSummary(householdId),
      getNetWorthHistory(householdId, "6M"),
      getMonthlySpending(householdId),
      getCashFlow(householdId, 6),
      getRecentTransactions(householdId, 5),
      getAccounts(householdId),
      getBudgetForMonth(householdId, getCurrentMonth()),
      getUpcomingBills(householdId, { limit: 5 }),
      getInvestmentsSummary(householdId),
    ]);

  const accounts = allAccounts
    .filter((a) => !a.isHidden)
    .map((a) => ({ id: a.id, name: a.name, type: a.type, currentBalance: a.currentBalance, currency: a.currency }));

  const savedLayout = await getLayout(userId);
  const layout = savedLayout ?? getDefaultLayout();

  const data: DashboardData = {
    summary,
    netWorthHistory,
    monthlySpending,
    cashFlow,
    recentTransactions,
    accounts,
    budgetData,
    upcomingBills,
    investmentsData,
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-4">Dashboard</h1>
      <DashboardGridLoader layout={layout} data={data} userId={userId} />
    </div>
  );
}
