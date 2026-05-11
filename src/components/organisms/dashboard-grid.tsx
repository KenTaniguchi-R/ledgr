"use client";

import { useState, useCallback, useTransition } from "react";
import { Responsive, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { GripVertical } from "lucide-react";

import { BudgetProgressWidget } from "./widgets/budget-progress";
import { NetWorthChart } from "./widgets/net-worth-chart";
import { SpendingByCategory } from "./widgets/spending-by-category";
import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import { RecentTransactionsWidget } from "./widgets/recent-transactions";
import { AccountBalancesWidget } from "./widgets/account-balances";
import { DashboardSummaryCards } from "./widgets/dashboard-summary-cards";
import { UpcomingBillsWidget } from "./widgets/upcoming-bills";
import { InvestmentsWidget } from "./widgets/investments-widget";
import { WidgetPlaceholder } from "@/components/molecules/widget-placeholder";
import { WIDGET_TITLE_MAP, type GridItem, type DashboardLayout } from "./widgets/registry";
import { saveLayout } from "@/actions/dashboard";
import type { DashboardSummary, NetWorthPoint, MonthlySpendingRow, CashFlowRow } from "@/queries/dashboard";
import type { TransactionRow } from "@/queries/transactions";
import type { AccountType } from "@/db/schema/accounts";
import type { BudgetMonth } from "@/queries/budgets";
import type { BillRow } from "@/queries/recurring";
import type { getInvestmentsSummary } from "@/queries/dashboard";

export interface DashboardData {
  summary: DashboardSummary;
  netWorthHistory: NetWorthPoint[];
  monthlySpending: MonthlySpendingRow[];
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
  const [layouts, setLayouts] = useState({
    lg: layout.desktop,
    md: layout.tablet,
    sm: layout.mobile,
  });
  const [nwRange, setNwRange] = useState("6M");
  const [nwData, setNwData] = useState(data.netWorthHistory);
  const [nwLoading, startNwTransition] = useTransition();
  const [spendMonth, setSpendMonth] = useState(() => new Date().toISOString().slice(0, 7));
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
        return <CashFlowBarChart data={data.cashFlow} />;
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
      case "bills":
        return <UpcomingBillsWidget data={data.upcomingBills} />;
      case "investments":
        return data.investmentsData ? (
          <InvestmentsWidget
            totalValue={data.investmentsData.totalValue}
            dayChange={data.investmentsData.dayChange}
          />
        ) : (
          <WidgetPlaceholder title="Investments" description="No investment accounts linked" />
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
              <Card className="h-full flex flex-col">
                <div className="flex items-center justify-between pb-2 pt-3 px-4">
                  <CardTitle className="text-sm font-medium">
                    {WIDGET_TITLE_MAP.get(item.i) ?? item.i}
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
