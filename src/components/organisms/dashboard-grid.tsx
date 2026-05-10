"use client";

import { useState, useCallback, useTransition } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { GripVertical } from "lucide-react";

import { BudgetProgressWidget } from "./widgets/budget-progress";
import { NetWorthChart } from "./widgets/net-worth-chart";
import { SpendingByCategory } from "./widgets/spending-by-category";
import { CashFlowChart } from "./widgets/cash-flow-chart";
import { RecentTransactionsWidget } from "./widgets/recent-transactions";
import { AccountBalancesWidget } from "./widgets/account-balances";
import { DashboardSummaryCards } from "./widgets/dashboard-summary-cards";
import { WidgetPlaceholder } from "@/components/molecules/widget-placeholder";
import { DASHBOARD_WIDGETS, type GridItem } from "./widgets/registry";
import { saveLayout } from "@/actions/dashboard";
import type { DashboardSummary, NetWorthPoint, MonthlySpendingRow, CashFlowRow } from "@/queries/dashboard";
import type { TransactionRow } from "@/queries/transactions";
import type { AccountType } from "@/db/schema/accounts";
import type { BudgetMonth } from "@/queries/budgets";

export interface DashboardData {
  summary: DashboardSummary;
  netWorthHistory: NetWorthPoint[];
  monthlySpending: MonthlySpendingRow[];
  cashFlow: CashFlowRow[];
  recentTransactions: TransactionRow[];
  accounts: { id: string; name: string; type: AccountType; currentBalance: number | null; currency: string | null }[];
  budgetData?: BudgetMonth;
}

interface DashboardGridProps {
  layout: { desktop: GridItem[]; tablet: GridItem[]; mobile: GridItem[] };
  data: DashboardData;
  userId: string;
}

export function DashboardGrid({ layout, data, userId }: DashboardGridProps) {
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1200 });
  const [layouts, setLayouts] = useState({
    lg: layout.desktop,
    md: layout.tablet,
    sm: layout.mobile,
  });
  const [nwRange, setNwRange] = useState("6M");
  const [nwData, setNwData] = useState(data.netWorthHistory);
  const [nwLoading, startNwTransition] = useTransition();
  const [spendMonth, setSpendMonth] = useState(new Date().toISOString().slice(0, 7));
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
      saveLayout(userId, newLayout);
    },
    [userId, layouts],
  );

  function renderWidget(id: string) {
    const config = DASHBOARD_WIDGETS.find((w) => w.id === id);
    if (!config) return null;
    if (config.isPlaceholder) {
      return <WidgetPlaceholder title={config.title} description={config.placeholderText ?? ""} />;
    }

    switch (id) {
      case "net-worth":
        return (
          <NetWorthChart
            data={nwData}
            currentRange={nwRange}
            onRangeChange={(range) => {
              setNwRange(range);
              startNwTransition(async () => {
                const res = await fetch(`/api/dashboard/net-worth?range=${range}`);
                const newData = await res.json();
                setNwData(newData);
              });
            }}
            isLoading={nwLoading}
          />
        );
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
        return <CashFlowChart data={data.cashFlow} />;
      case "recent-txns":
        return <RecentTransactionsWidget data={data.recentTransactions} />;
      case "accounts":
        return <AccountBalancesWidget data={data.accounts} />;
      case "summary":
        return <DashboardSummaryCards data={data.summary} />;
      case "budgets":
        return data.budgetData ? (
          <BudgetProgressWidget data={data.budgetData} />
        ) : (
          <WidgetPlaceholder title="Budget Progress" description="No budget data" />
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
          cols={{ lg: 4, md: 2, sm: 1 }}
          rowHeight={160}
          onLayoutChange={handleLayoutChange}
          dragConfig={{ enabled: true, handle: ".drag-handle", bounded: false, threshold: 3 }}
          resizeConfig={{ enabled: false }}
          margin={[16, 16]}
        >
          {layouts.lg.map((item) => (
            <div key={item.i}>
              <Card className="h-full flex flex-col">
                <div className="flex items-center justify-between pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">
                    {DASHBOARD_WIDGETS.find((w) => w.id === item.i)?.title ?? item.i}
                  </CardTitle>
                  <GripVertical className="size-4 text-muted-foreground cursor-grab drag-handle" />
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
