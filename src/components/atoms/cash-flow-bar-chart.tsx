"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { centsToDisplay, centsToCompact } from "@/lib/money";
import { formatMonthShort } from "@/lib/date-utils";
import { INCOME_COLOR, SPENDING_COLOR, PRIMARY_COLOR } from "@/lib/chart-colors";
import type { CashFlowRow } from "@/queries/dashboard";

interface CashFlowBarChartProps {
  data: CashFlowRow[];
  showTrendline?: boolean;
}

export function CashFlowBarChart({ data, showTrendline = false }: CashFlowBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Cash flow data will appear after your first sync.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonthShort}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={centsToCompact}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          width={44}
          axisLine={false}
          tickLine={false}
          tickCount={4}
        />
        <Tooltip
          formatter={(v) => centsToDisplay(Number(v))}
          labelFormatter={(label) => formatMonthShort(String(label))}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
        <Bar dataKey="expenses" name="Spending" fill={SPENDING_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
        {showTrendline && (
          <Line
            type="monotone"
            dataKey="net"
            name="Net"
            stroke={PRIMARY_COLOR}
            strokeWidth={2}
            dot={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
