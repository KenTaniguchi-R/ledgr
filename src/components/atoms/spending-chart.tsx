"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { CHART_COLORS } from "@/lib/chart-colors";

export interface SpendingChartItem {
  id: string | null;
  name: string;
  value: number;
}

interface SpendingChartProps {
  data: SpendingChartItem[];
  viewMode: "donut" | "bar";
  onItemClick?: (item: { id: string | null; name: string }) => void;
}

// The aggregated "Other" row (built below from categories past the top 8) is
// not a real category — give it a fixed neutral color instead of cycling back
// into CHART_COLORS, which would collide with an earlier slice's color.
// Real uncategorized spend can also carry a null id under a different name,
// so key off both id and name to avoid recoloring legitimate rows.
function colorAt(item: SpendingChartItem, i: number): string {
  if (item.id === null && item.name === "Other") return "var(--chart-neutral)";
  return CHART_COLORS[i % CHART_COLORS.length];
}

export function SpendingChart({ data, viewMode, onItemClick }: SpendingChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No spending data available.
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const top8 = data.slice(0, 8);
  const otherTotal = data.slice(8).reduce((sum, d) => sum + d.value, 0);
  const chartData: SpendingChartItem[] =
    otherTotal > 0
      ? [...top8, { id: null, name: "Other", value: otherTotal }]
      : top8;

  function handleClick(index: number) {
    if (!onItemClick) return;
    const item = chartData[index];
    if (item) onItemClick({ id: item.id, name: item.name });
  }

  if (viewMode === "donut") {
    return (
      <div className="flex gap-3 h-full">
        <div className="w-2/5 shrink-0">
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
                onClick={(_, index) => handleClick(index)}
                className={onItemClick ? "cursor-pointer" : ""}
              >
                {chartData.map((item, i) => (
                  <Cell key={i} fill={colorAt(item, i)} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => centsToDisplay(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-3/5 overflow-y-auto">
          {chartData.map((row, i) => (
            <SpendingLegendRow
              key={row.name}
              name={row.name}
              amount={row.value}
              percentage={total > 0 ? (row.value / total) * 100 : 0}
              color={colorAt(row, i)}
              onClick={onItemClick ? () => handleClick(i) : undefined}
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
        <Bar
          dataKey="value"
          onClick={(_, index) => handleClick(index)}
          className={onItemClick ? "cursor-pointer" : ""}
        >
          {chartData.map((item, i) => (
            <Cell key={i} fill={colorAt(item, i)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SpendingLegendRow({
  name,
  amount,
  percentage,
  color,
  onClick,
}: {
  name: string;
  amount: number;
  percentage: number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 py-1 text-sm ${onClick ? "cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1" : ""}`}
      onClick={onClick}
    >
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="truncate flex-1">{name}</span>
      <span className="font-medium tabular-nums">{centsToDisplay(amount)}</span>
      <span className="text-muted-foreground text-xs w-10 text-right">{percentage.toFixed(0)}%</span>
    </div>
  );
}
