"use client";

import { useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BudgetSummaryBar } from "@/components/molecules/budget-summary-bar";
import { BudgetGroupSection } from "@/components/organisms/budget-group-section";
import { AmountDisplay } from "@/components/atoms/amount-display";
import type { BudgetMonth } from "@/queries/budgets";

interface BudgetTableProps {
  data: BudgetMonth;
}

export function BudgetTable({ data }: BudgetTableProps) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      router.refresh();
    }, 1000);
  }, [router]);

  const budgetType = data.budget?.type ?? "category";

  const fixedGroups = data.groups.filter((g) =>
    g.categories.some((c) => c.isFixed),
  );
  const variableGroups = data.groups.filter((g) =>
    g.categories.some((c) => !c.isFixed),
  );

  return (
    <div className="space-y-4">
      <BudgetSummaryBar
        totalBudgeted={data.summary.totalBudgeted}
        totalSpent={data.summary.totalSpent}
        totalRemaining={data.summary.totalRemaining}
        budgetType={budgetType}
        lastSyncedAt={data.lastSyncedAt}
      />

      {fixedGroups.length > 0 && (
        <div className="space-y-2">
          {fixedGroups.map((group) => (
            <BudgetGroupSection
              key={group.groupId}
              budgetId={data.budget!.id}
              groupName={group.groupName}
              groupIcon={group.groupIcon}
              categories={group.categories.filter((c) => c.isFixed)}
              totalBudgeted={group.totalBudgeted}
              totalSpent={group.totalSpent}
              defaultCollapsed
              isFixed
              onSaved={debouncedRefresh}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {variableGroups.map((group) => (
          <BudgetGroupSection
            key={group.groupId}
            budgetId={data.budget!.id}
            groupName={group.groupName}
            groupIcon={group.groupIcon}
            categories={group.categories.filter((c) => !c.isFixed)}
            totalBudgeted={group.totalBudgeted}
            totalSpent={group.totalSpent}
            onSaved={debouncedRefresh}
          />
        ))}
      </div>

      {data.unbudgeted.categories.length > 0 && (
        <div className="border rounded-lg">
          <div className="flex items-center justify-between px-3 py-2 text-sm font-medium bg-muted/20 rounded-t-lg">
            <span className="text-muted-foreground">Everything Else</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              <AmountDisplay amount={data.unbudgeted.spent} className="text-xs" />
            </span>
          </div>
          <table className="w-full">
            <tbody>
              {data.unbudgeted.categories.map((cat) => (
                <tr key={cat.categoryId} className="border-b last:border-b-0">
                  <td className="py-2 px-3 text-sm text-muted-foreground">
                    {cat.categoryName}
                    {cat.groupName && (
                      <span className="text-xs ml-1">({cat.groupName})</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <AmountDisplay amount={cat.spent} className="text-xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
