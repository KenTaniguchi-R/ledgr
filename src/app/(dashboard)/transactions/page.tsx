import { getHouseholdId } from "@/lib/auth/session";
import { getTransactions, type TransactionFilters } from "@/queries/transactions";
import { getCategories } from "@/queries/categories";
import { getAccounts } from "@/queries/accounts";
import { TransactionFilters as FilterBar } from "@/components/molecules/transaction-filters";
import { TransactionList } from "@/components/organisms/transaction-list";
import { TransactionEmptyState } from "@/components/molecules/transaction-empty-state";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;

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
    reviewed: params.reviewed === "true" ? true : undefined,
  };

  const page = getTransactions(householdId, filters);
  const allCategories = getCategories(householdId);
  const allAccounts = getAccounts(householdId);

  const hasFilters = Object.values(filters).some((v) => v !== undefined);
  const accountOptions = allAccounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>

      <FilterBar accounts={accountOptions} categories={allCategories} />

      {page.rows.length === 0 ? (
        <TransactionEmptyState hasFilters={hasFilters} />
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
