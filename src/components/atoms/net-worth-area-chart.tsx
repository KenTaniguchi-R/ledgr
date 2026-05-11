"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { centsToDisplay } from "@/lib/money";
import { formatDateShort } from "@/lib/date-utils";
import { INCOME_COLOR, EXPENSE_COLOR, PRIMARY_COLOR } from "@/lib/chart-colors";
import type { NetWorthPoint } from "@/queries/dashboard";

type ChartDataPoint = Record<string, string | number>;

interface NetWorthAreaChartProps {
  data: NetWorthPoint[] | { date: string; value: number }[];
  height?: number;
  mode?: "multi" | "single";
  seriesName?: string;
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{formatDateShort(label ?? "")}</p>
      {payload.map((entry: TooltipEntry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {centsToDisplay(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function NetWorthAreaChart({ data, mode = "multi", seriesName = "Value" }: NetWorthAreaChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {mode === "single" ? "Portfolio history will appear after your accounts sync." : "Net worth history will appear after your accounts sync."}
      </div>
    );
  }

  if (mode === "single") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data as ChartDataPoint[]} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
            tick={{ fontSize: 11 }}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            name={seriesName}
            fill="url(#portfolioGradient)"
            stroke={PRIMARY_COLOR}
            strokeWidth={2}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data as ChartDataPoint[]} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="date" tickFormatter={formatDateShort} tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="netWorth"
          name="Net Worth"
          fill="hsl(var(--primary) / 0.1)"
          stroke={PRIMARY_COLOR}
          strokeWidth={2}
        />
        <Line type="monotone" dataKey="assets" name="Assets" stroke={INCOME_COLOR} strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke={EXPENSE_COLOR} strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
