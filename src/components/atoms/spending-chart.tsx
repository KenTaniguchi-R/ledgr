"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { MonthlySpendingRow } from "@/queries/dashboard";

interface SpendingChartProps {
  data: MonthlySpendingRow[];
  viewMode: "donut" | "bar";
}

export function SpendingChart({ data, viewMode }: SpendingChartProps) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const top8 = data.slice(0, 8);
  const otherTotal = data.slice(8).reduce((sum, d) => sum + d.total, 0);
  const chartData =
    otherTotal > 0
      ? [
          ...top8,
          {
            categoryId: null,
            categoryName: "Other",
            categoryIcon: "📦",
            groupName: "Other",
            total: otherTotal,
          },
        ]
      : top8;

  if (viewMode === "donut") {
    return (
      <div className="flex gap-4 h-full">
        <div className="w-1/2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="total"
                nameKey="categoryName"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => centsToDisplay(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-1/2 overflow-y-auto">
          {chartData.map((row, i) => (
            <SpendingLegendRow
              key={row.categoryId ?? "other"}
              name={row.categoryName}
              icon={row.categoryIcon ?? "📦"}
              amount={row.total}
              percentage={total > 0 ? (row.total / total) * 100 : 0}
              color={CHART_COLORS[i % CHART_COLORS.length]}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
        <XAxis
          type="number"
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
        />
        <YAxis type="category" dataKey="categoryName" tick={{ fontSize: 11 }} width={75} />
        <Tooltip formatter={(v) => centsToDisplay(Number(v))} />
        <Bar dataKey="total">
          {chartData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SpendingLegendRow({
  name,
  icon,
  amount,
  percentage,
  color,
}: {
  name: string;
  icon: string;
  amount: number;
  percentage: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="truncate flex-1">
        {icon} {name}
      </span>
      <span className="font-medium tabular-nums">{centsToDisplay(amount)}</span>
      <span className="text-muted-foreground text-xs w-10 text-right">{percentage.toFixed(0)}%</span>
    </div>
  );
}
