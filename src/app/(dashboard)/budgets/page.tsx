import { getHouseholdId } from "@/lib/auth/session";
import { getBudgetForMonth } from "@/queries/budgets";
import { BudgetPageHeader } from "@/components/organisms/budget-page-header";
import { BudgetTable } from "@/components/organisms/budget-table";
import { BudgetEmptyState } from "@/components/molecules/budget-empty-state";

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const householdId = await getHouseholdId();
  const params = await searchParams;
  const monthParam = typeof params.month === "string" ? params.month : "";
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : getCurrentMonth();
  const prevMonth = previousMonth(month);

  const data = getBudgetForMonth(householdId, month);
  const prevData = getBudgetForMonth(householdId, prevMonth);
  const hasPrevBudget = prevData.budget !== null;

  return (
    <div className="space-y-4">
      <BudgetPageHeader
        month={month}
        budgetId={data.budget?.id ?? null}
        budgetType={(data.budget?.type ?? "category") as "category" | "flex"}
        hasPreviousMonthBudget={hasPrevBudget}
        previousMonth={prevMonth}
      />

      {data.budget ? (
        <BudgetTable data={data} />
      ) : (
        <BudgetEmptyState
          month={month}
          hasPreviousMonthBudget={hasPrevBudget}
          previousMonth={prevMonth}
        />
      )}
    </div>
  );
}
