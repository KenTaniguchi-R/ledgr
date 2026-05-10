import { getHouseholdId } from "@/lib/auth/session";
import { getUpcomingBills, getRecurringSummary } from "@/queries/recurring";
import { centsToDisplay } from "@/lib/money";
import { BillList } from "@/components/organisms/bill-list";
import { BillSearch } from "@/components/molecules/bill-search";
import { BillEmptyState } from "@/components/molecules/bill-empty-state";

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;
  const bills = getUpcomingBills(householdId, { search: params.q });
  const summary = getRecurringSummary(householdId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {summary.monthlyExpenses > 0 && (
              <span>
                {centsToDisplay(summary.monthlyExpenses)}/mo in recurring expenses
              </span>
            )}
            {summary.monthlyIncome > 0 && summary.monthlyExpenses > 0 && " · "}
            {summary.monthlyIncome > 0 && (
              <span>
                {centsToDisplay(summary.monthlyIncome)}/mo recurring income
              </span>
            )}
          </p>
        </div>
        {bills.length > 0 && <BillSearch />}
      </div>

      {bills.length === 0 ? <BillEmptyState /> : <BillList bills={bills} />}
    </div>
  );
}
