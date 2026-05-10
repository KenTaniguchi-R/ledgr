"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { CHART_COLORS } from "@/lib/chart-colors";
import type { MonthlySpendingRow } from "@/queries/dashboard";

export interface ChartDataItem {
  name: string;
  value: number;
}

interface SpendingChartProps {
  data: MonthlySpendingRow[] | ChartDataItem[];
  viewMode: "donut" | "bar";
}

export function SpendingChart({ data, viewMode }: SpendingChartProps) {
  const normalizedData: ChartDataItem[] = data.map((item) => {
    if ("categoryName" in item) {
      return { name: item.categoryName, value: item.total };
    }
    return item;
  });

  const total = normalizedData.reduce((sum, d) => sum + d.value, 0);
  const top8 = normalizedData.slice(0, 8);
  const otherTotal = normalizedData.slice(8).reduce((sum, d) => sum + d.value, 0);
  const chartData: ChartDataItem[] =
    otherTotal > 0
      ? [
          ...top8,
          {
            name: "Other",
            value: otherTotal,
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
                dataKey="value"
                nameKey="name"
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
              key={row.name}
              name={row.name}
              amount={row.value}
              percentage={total > 0 ? (row.value / total) * 100 : 0}
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
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
        <Tooltip formatter={(v) => centsToDisplay(Number(v))} />
        <Bar dataKey="value">
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
  icon?: string;
  amount: number;
  percentage: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="truncate flex-1">
        {icon ? `${icon} ` : ""}{name}
      </span>
      <span className="font-medium tabular-nums">{centsToDisplay(amount)}</span>
      <span className="text-muted-foreground text-xs w-10 text-right">{percentage.toFixed(0)}%</span>
    </div>
  );
}
