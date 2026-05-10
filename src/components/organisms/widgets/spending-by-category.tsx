"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartViewToggle } from "@/components/atoms/chart-view-toggle";
import { SpendingCategoryRow } from "@/components/molecules/spending-category-row";
import { centsToDisplay } from "@/lib/money";
import type { MonthlySpendingRow } from "@/queries/dashboard";

const COLORS = [
  "hsl(142 76% 36%)", "hsl(221 83% 53%)", "hsl(262 83% 58%)",
  "hsl(25 95% 53%)", "hsl(346 77% 50%)", "hsl(47 96% 53%)",
  "hsl(173 80% 36%)", "hsl(322 65% 55%)",
];

interface SpendingByCategoryProps {
  data: MonthlySpendingRow[];
  currentMonth: string;
  onMonthChange: (month: string) => void;
  isLoading?: boolean;
}

function formatMonth(month: string) {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function navigateMonth(month: string, direction: -1 | 1): string {
  const d = new Date(month + "-01");
  d.setMonth(d.getMonth() + direction);
  return d.toISOString().slice(0, 7);
}

export function SpendingByCategory({ data, currentMonth, onMonthChange, isLoading }: SpendingByCategoryProps) {
  const [view, setView] = useState<"donut" | "bar">("donut");

  const total = data.reduce((sum, d) => sum + d.total, 0);
  const top8 = data.slice(0, 8);
  const otherTotal = data.slice(8).reduce((sum, d) => sum + d.total, 0);
  const chartData = otherTotal > 0
    ? [...top8, { categoryId: null, categoryName: "Other", categoryIcon: "📦", groupName: "Other", total: otherTotal }]
    : top8;

  if (data.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No spending data for {formatMonth(currentMonth)}.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => onMonthChange(navigateMonth(currentMonth, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">{formatMonth(currentMonth)}</span>
          <Button variant="ghost" size="icon" className="size-6" onClick={() => onMonthChange(navigateMonth(currentMonth, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <ChartViewToggle value={view} onChange={setView} />
      </div>
      <div className="flex-1 min-h-0 flex gap-4">
        {view === "donut" ? (
          <>
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={chartData} dataKey="total" nameKey="categoryName" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%">
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => centsToDisplay(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 overflow-y-auto">
              {chartData.map((row, i) => (
                <SpendingCategoryRow
                  key={row.categoryId ?? "other"}
                  name={row.categoryName}
                  icon={row.categoryIcon ?? "📦"}
                  amount={row.total}
                  percentage={total > 0 ? (row.total / total) * 100 : 0}
                  color={COLORS[i % COLORS.length]}
                />
              ))}
            </div>
          </>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
              <XAxis type="number" tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="categoryName" tick={{ fontSize: 11 }} width={75} />
              <Tooltip formatter={(v) => centsToDisplay(Number(v))} />
              <Bar dataKey="total">
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
