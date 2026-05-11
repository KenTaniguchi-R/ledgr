import { getHouseholdId } from "@/lib/auth/session";
import {
  getTransactions,
  getTransactionSummary,
  type TransactionFilters,
} from "@/queries/transactions";
import { getCategories } from "@/queries/categories";
import { getAccounts } from "@/queries/accounts";
import { TransactionFilters as FilterBar } from "@/components/molecules/transaction-filters";
import { FilterSummaryBar } from "@/components/molecules/filter-summary-bar";
import { ReviewEntryButton } from "@/components/molecules/review-entry-button";
import { TransactionList } from "@/components/organisms/transaction-list";
import { TransactionEmptyState } from "@/components/molecules/transaction-empty-state";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;

  const isReviewMode = params.mode === "review";

  const rawAmountMin = typeof params.amountMin === "string" ? parseInt(params.amountMin, 10) : undefined;
  const amountMin = rawAmountMin !== undefined && Number.isInteger(rawAmountMin) && rawAmountMin >= 0 ? rawAmountMin : undefined;

  const rawAmountMax = typeof params.amountMax === "string" ? parseInt(params.amountMax, 10) : undefined;
  const amountMax = rawAmountMax !== undefined && Number.isInteger(rawAmountMax) && rawAmountMax >= 0 ? rawAmountMax : undefined;

  const rawType = typeof params.type === "string" ? params.type : undefined;
  const transactionType = rawType === "expense" || rawType === "credits" || rawType === "transfer"
    ? rawType
    : undefined;

  const filters: TransactionFilters = {
    accountId: typeof params.account === "string" ? params.account : undefined,
    categoryId:
      params.category === "uncategorized"
        ? null
        : typeof params.category === "string"
          ? params.category
          : undefined,
    dateFrom: typeof params.from === "string" ? params.from : undefined,
    dateTo: typeof params.to === "string" ? params.to : undefined,
    search: typeof params.q === "string" ? params.q : undefined,
    reviewed: isReviewMode ? false : (params.reviewed === "true" ? true : undefined),
    amountMin,
    amountMax,
    transactionType,
  };

  const page = getTransactions(householdId, filters);
  const allCategories = getCategories(householdId);
  const allAccounts = getAccounts(householdId);

  const hasAnyFilters = Object.values(filters).some((v) => v !== undefined);
  const summary = hasAnyFilters ? getTransactionSummary(householdId, filters) : null;
  const unreviewedSummary = getTransactionSummary(householdId, { reviewed: false });
  const accountOptions = allAccounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <ReviewEntryButton unreviewedCount={unreviewedSummary.count} />
      </div>

      <FilterBar accounts={accountOptions} categories={allCategories} />

      {summary && (
        <FilterSummaryBar
          count={summary.count}
          totalExpense={summary.totalExpense}
          totalIncome={summary.totalIncome}
          net={summary.net}
        />
      )}

      {page.rows.length === 0 ? (
        <TransactionEmptyState hasFilters={hasAnyFilters} />
      ) : (
        <TransactionList
          key={JSON.stringify(filters)}
          initialRows={page.rows}
          nextCursor={page.nextCursor}
          categories={allCategories}
          filters={filters}
        />
      )}
    </div>
  );
}
