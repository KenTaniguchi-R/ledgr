import { getHouseholdId } from "@/lib/auth/session";
import {
  getInvestmentAccountIds,
  getPortfolioSummary,
  getPortfolioHistory,
  getAssetAllocation,
  getHoldings,
  getInvestmentTransactions,
  type InvestmentFilters,
} from "@/queries/investments";
import { getAccounts } from "@/queries/accounts";
import { rangeToDateBounds } from "@/lib/date-utils";
import { InvestmentPageLayout } from "@/components/organisms/investment-page-layout";

const VALID_TABS = new Set(["holdings", "transactions"]);
const VALID_VIEWS = new Set(["consolidated", "by-account"]);

export default async function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;

  const tab =
    typeof params.tab === "string" && VALID_TABS.has(params.tab)
      ? params.tab
      : "holdings";
  const view =
    typeof params.view === "string" && VALID_VIEWS.has(params.view)
      ? (params.view as "consolidated" | "by-account")
      : "consolidated";

  const { from: dateFrom, to: dateTo } = rangeToDateBounds("1Y");
  const accountId =
    typeof params.account === "string" ? params.account : undefined;
  const type = typeof params.type === "string" ? params.type : undefined;

  const filters: InvestmentFilters = {
    dateFrom: dateFrom ?? undefined,
    dateTo,
    accountId,
    type,
  };

  // getAccounts is independent of accIds — start it concurrently.
  const accountsPromise = getAccounts(householdId);
  const accIds = await getInvestmentAccountIds(householdId);

  const [summary, history, allocation, holdings, transactions] = await Promise.all([
    getPortfolioSummary(householdId, undefined, undefined, accIds),
    getPortfolioHistory(householdId, { dateFrom: dateFrom ?? dateTo, dateTo }, undefined, accIds),
    getAssetAllocation(householdId, undefined, accIds),
    tab === "holdings"
      ? getHoldings(householdId, view, accountId, undefined, accIds)
      : Promise.resolve(null),
    tab === "transactions"
      ? getInvestmentTransactions(householdId, filters, 50, null, undefined, accIds)
      : Promise.resolve(null),
  ]);

  const allAccounts = await accountsPromise;
  const investmentAccounts = allAccounts
    .filter((a) => a.type === "investment")
    .map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
      <InvestmentPageLayout
        summary={summary}
        history={history}
        allocation={allocation}
        holdings={holdings}
        transactions={
          transactions
            ? { rows: transactions.rows, nextCursor: transactions.nextCursor }
            : null
        }
        activeTab={tab}
        view={view}
        filters={filters}
        accounts={investmentAccounts}
      />
    </div>
  );
}
