"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { centsToDisplay, centsToCompact } from "@/lib/money";
import { formatMonthShort } from "@/lib/date-utils";
import { INCOME_COLOR, SPENDING_COLOR, PRIMARY_COLOR } from "@/lib/chart-colors";
import type { CashFlowRow } from "@/queries/dashboard";

interface CashFlowBarChartProps {
  data: CashFlowRow[];
  showTrendline?: boolean;
}

const chartConfig = {
  income: { label: "Income", color: INCOME_COLOR },
  expenses: { label: "Spending", color: SPENDING_COLOR },
  net: { label: "Net", color: PRIMARY_COLOR },
} satisfies ChartConfig;

export function CashFlowBarChart({ data, showTrendline = false }: CashFlowBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Cash flow data will appear after your first sync.
      </div>
    );
  }

  return (
    // Every caller sizes this chart with an explicit-height parent, so fill it
    // rather than taking ChartContainer's default 16:9 aspect ratio.
    <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
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
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              labelFormatter={(label) => formatMonthShort(String(label))}
              valueFormatter={(v) => centsToDisplay(Number(v))}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        {showTrendline && (
          <Line
            type="monotone"
            dataKey="net"
            stroke="var(--color-net)"
            strokeWidth={2}
            dot={false}
          />
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
