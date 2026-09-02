"use client";

import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { activateOnKey } from "@/lib/a11y";
import { CHART_COLORS } from "@/lib/chart-colors";

export interface SpendingChartItem {
  id: string | null;
  name: string;
  value: number;
  /** Set on the rolled-up "Other" slice this chart builds; not a real category. */
  synthetic?: boolean;
}

interface SpendingChartProps {
  data: SpendingChartItem[];
  viewMode: "donut" | "bar";
  onItemClick?: (item: { id: string | null; name: string }) => void;
}

// Two rows take the neutral rather than a palette slot. "Other" (rolled up from
// categories past the top 8) is not a real category, and cycling back into
// CHART_COLORS would collide with an earlier slice. Uncategorized is not a
// category either — it is the absence of one, and as the largest slice in most
// households it was taking CHART_COLORS[0], the loudest blue, making "we do not
// know" the visual hero of the chart.
function colorAt(item: SpendingChartItem, i: number): string {
  if (item.synthetic || item.id === null) return "var(--chart-neutral)";
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
      ? [...top8, { id: null, name: "Other", value: otherTotal, synthetic: true }]
      : top8;

  function handleClick(index: number) {
    if (!onItemClick) return;
    const item = chartData[index];
    // "Other" spans several categories, which drill-down can't express — a null
    // id there would be read as uncategorized, so leave the slice inert.
    if (item && !item.synthetic) onItemClick({ id: item.id, name: item.name });
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
        <div className="w-3/5 overflow-y-auto overflow-x-hidden">
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
    // Recharts' sectors cannot take focus, so this legend is the keyboard route
    // into the donut. An inert row (no onClick) stays out of the tab order.
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Show ${name} transactions` : undefined}
      className={`flex items-center gap-2 py-1 text-sm ${onClick ? "cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring rounded px-1 -mx-1" : ""}`}
      onClick={onClick}
      onKeyDown={activateOnKey(onClick)}
    >
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="truncate flex-1">{name}</span>
      <span className="font-medium tabular-nums">{centsToDisplay(amount)}</span>
      <span className="text-muted-foreground text-xs w-10 text-right">{percentage.toFixed(0)}%</span>
    </div>
  );
}
