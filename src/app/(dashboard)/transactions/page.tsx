import { getHouseholdId } from "@/lib/auth/session";
import {
  getTransactions,
  getTransactionSummary,
} from "@/queries/transactions";
import { getCategories } from "@/queries/categories";
import { getAccounts } from "@/queries/accounts";
import { parseTransactionFilters } from "@/lib/parse-transaction-filters";
import { TransactionFilters as FilterBar } from "@/components/organisms/transaction-filters";
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
  const { filters } = parseTransactionFilters(params);

  const hasAnyFilters = Object.entries(filters)
    .filter(([k]) => k !== "reviewed")
    .some(([, v]) => v !== undefined);

  const [page, allCategories, allAccounts, summary, unreviewedSummary] = await Promise.all([
    getTransactions(householdId, filters),
    getCategories(householdId),
    getAccounts(householdId),
    hasAnyFilters ? getTransactionSummary(householdId, filters) : Promise.resolve(null),
    getTransactionSummary(householdId, { reviewed: false }),
  ]);
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
