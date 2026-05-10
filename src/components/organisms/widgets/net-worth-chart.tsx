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
import { DateRangeSelector } from "@/components/atoms/date-range-selector";
import { centsToDisplay } from "@/lib/money";
import type { NetWorthPoint } from "@/queries/dashboard";

interface NetWorthChartProps {
  data: NetWorthPoint[];
  onRangeChange: (range: string) => void;
  currentRange: string;
  isLoading?: boolean;
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{formatDate(label)}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {centsToDisplay(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function NetWorthChart({ data, onRangeChange, currentRange, isLoading }: NetWorthChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Net worth history will appear after your accounts sync.
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      <div className="flex justify-end mb-2">
        <DateRangeSelector value={currentRange} onChange={onRangeChange} />
      </div>
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
          <div className="animate-pulse text-sm text-muted-foreground">Loading...</div>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tickFormatter={formatDate} className="text-xs" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")} className="text-xs" tick={{ fontSize: 11 }} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="netWorth" name="Net Worth" fill="hsl(var(--primary) / 0.1)" stroke="hsl(var(--primary))" strokeWidth={2} />
            <Line type="monotone" dataKey="assets" name="Assets" stroke="hsl(142 76% 36%)" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
