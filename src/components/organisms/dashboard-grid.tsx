"use client";

import { useState, useCallback, useTransition } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { GripVertical } from "lucide-react";

import { BudgetProgressWidget } from "./widgets/budget-progress";
import { SpendingByCategory } from "./widgets/spending-by-category";
import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { RecentTransactionsWidget } from "./widgets/recent-transactions";
import { AccountBalancesWidget } from "./widgets/account-balances";
import { UpcomingBillsWidget } from "./widgets/upcoming-bills";
import { InvestmentsWidget } from "./widgets/investments-widget";
import { WidgetPlaceholder } from "@/components/molecules/widget-placeholder";
import { WIDGET_TITLE_MAP, RETIRED_WIDGET_IDS, type GridItem, type DashboardLayout } from "./widgets/registry";
import { saveLayout } from "@/actions/dashboard";
import type { MonthlySpendingRow, CashFlowRow } from "@/queries/dashboard";
import type { TransactionRow } from "@/queries/transactions";
import type { AccountType } from "@/db/schema/accounts";
import type { BudgetMonth } from "@/queries/budgets";
import type { BillRow } from "@/queries/recurring";
import type { getInvestmentsSummary } from "@/queries/dashboard";

export interface DashboardData {
  monthlySpending: MonthlySpendingRow[];
  spendingMonth: string;
  cashFlow: CashFlowRow[];
  recentTransactions: TransactionRow[];
  accounts: { id: string; name: string; type: AccountType; currentBalance: number | null; currency: string | null }[];
  budgetData?: BudgetMonth;
  upcomingBills: BillRow[];
  investmentsData?: Awaited<ReturnType<typeof getInvestmentsSummary>>;
}

interface DashboardGridProps {
  layout: DashboardLayout;
  data: DashboardData;
}

export function DashboardGrid({ layout, data }: DashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });
  // Saved layouts may still reference widgets that moved out of the grid
  // (net worth and summary now render as the page hero and stat row).
  const filterRetired = (items: GridItem[]) => items.filter((i) => !RETIRED_WIDGET_IDS.has(i.i));
  const [layouts, setLayouts] = useState({
    lg: filterRetired(layout.desktop),
    md: filterRetired(layout.tablet),
    sm: filterRetired(layout.mobile),
  });
  const [spendMonth, setSpendMonth] = useState(data.spendingMonth);
  const [spendData, setSpendData] = useState(data.monthlySpending);
  const [spendLoading, startSpendTransition] = useTransition();

  const handleLayoutChange = useCallback(
    (_layout: readonly unknown[], allLayouts: Partial<Record<string, readonly GridItem[]>>) => {
      const newLayout = {
        desktop: [...(allLayouts.lg ?? layouts.lg)],
        tablet: [...(allLayouts.md ?? layouts.md)],
        mobile: [...(allLayouts.sm ?? layouts.sm)],
      };
      setLayouts({ lg: newLayout.desktop, md: newLayout.tablet, sm: newLayout.mobile });
      saveLayout(newLayout);
    },
    [layouts],
  );

  function renderWidget(id: string) {
    switch (id) {
      case "spending":
        return (
          <SpendingByCategory
            data={spendData}
            currentMonth={spendMonth}
            onMonthChange={(month) => {
              setSpendMonth(month);
              startSpendTransition(async () => {
                const res = await fetch(`/api/dashboard/spending?month=${month}`);
                const newData = await res.json();
                setSpendData(newData);
              });
            }}
            isLoading={spendLoading}
          />
        );
      case "cash-flow":
        return <CashFlowBarChart data={data.cashFlow} />;
      case "recent-txns":
        return <RecentTransactionsWidget data={data.recentTransactions} />;
      case "accounts":
        return <AccountBalancesWidget data={data.accounts} />;
      case "budgets":
        return data.budgetData ? (
          <BudgetProgressWidget data={data.budgetData} />
        ) : (
          <WidgetPlaceholder
            title="No budgets yet"
            description="Set monthly limits per category and track progress here."
            actions={[{ label: "Create a budget", href: "/budgets", primary: true }]}
          />
        );
      case "bills":
        return <UpcomingBillsWidget data={data.upcomingBills} />;
      case "investments":
        return data.investmentsData ? (
          <InvestmentsWidget
            totalValue={data.investmentsData.totalValue}
            dayChange={data.investmentsData.dayChange}
          />
        ) : (
          <WidgetPlaceholder
            title="No investment accounts linked"
            description="Connect a brokerage to track holdings and performance here."
            actions={[
              { label: "Connect accounts", href: "/accounts", primary: true },
              { label: "Import CSV", href: "/import" },
            ]}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div ref={containerRef}>
      {mounted && (
        <Responsive
          width={width}
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 768, sm: 0 }}
          cols={{ lg: 2, md: 2, sm: 1 }}
          rowHeight={160}
          onLayoutChange={handleLayoutChange}
          dragConfig={{ enabled: true, handle: ".drag-handle", bounded: false, threshold: 3 }}
          resizeConfig={{ enabled: false }}
          margin={[16, 16]}
        >
          {layouts.lg.map((item) => (
            <div key={item.i}>
              <Card className="group h-full flex flex-col">
                <div className="flex items-center justify-between pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">
                    {WIDGET_TITLE_MAP.get(item.i) ?? item.i}
                  </CardTitle>
                  <GripVertical className="size-4 text-muted-foreground cursor-grab drag-handle opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity" />
                </div>
                <CardContent className="flex-1 min-h-0 pb-3 px-4">
                  {renderWidget(item.i)}
                </CardContent>
              </Card>
            </div>
          ))}
        </Responsive>
      )}
    </div>
  );
}
