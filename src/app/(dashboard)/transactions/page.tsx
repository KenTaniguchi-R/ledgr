import { getHouseholdId } from "@/lib/auth/session";
import { withHousehold } from "@/lib/household-context";
import {
  getTransactions,
  getTransactionSummary,
  getSuggestedTransfers,
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

  const [page, allCategories, allAccounts, summary, unreviewedSummary, suggestedTransfers] = await Promise.all([
    withHousehold(householdId, (tx) => getTransactions(householdId, filters, undefined, undefined, tx)),
    getCategories(householdId),
    getAccounts(householdId),
    // Always summarised, not only when a filter is applied. The unfiltered view
    // is the one people land on, and it was the only view of the ledger with no
    // arithmetic on it at all — per-day subtotals, and nothing for the whole.
    withHousehold(householdId, (tx) => getTransactionSummary(householdId, filters, tx)),
    withHousehold(householdId, (tx) => getTransactionSummary(householdId, { reviewed: false }, tx)),
    withHousehold(householdId, (tx) => getSuggestedTransfers(householdId, tx)),
  ]);
  const accountOptions = allAccounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <ReviewEntryButton unreviewedCount={unreviewedSummary.count} />
      </div>

      <FilterBar
        accounts={accountOptions}
        categories={allCategories}
        resultCount={summary?.count ?? 0}
      />

      {summary && (
        <FilterSummaryBar
          count={summary.count}
          totalExpense={summary.totalExpense}
          totalIncome={summary.totalIncome}
          net={summary.net}
        />
      )}

      {page.rows.length === 0 && suggestedTransfers.length === 0 ? (
        <TransactionEmptyState hasFilters={hasAnyFilters} />
      ) : (
        <TransactionList
          key={JSON.stringify(filters)}
          initialRows={page.rows}
          nextCursor={page.nextCursor}
          categories={allCategories}
          filters={filters}
          suggestedTransfers={suggestedTransfers}
        />
      )}
    </div>
  );
}
