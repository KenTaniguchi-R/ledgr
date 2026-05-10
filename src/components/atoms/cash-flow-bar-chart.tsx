"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { formatMonthShort } from "@/lib/date-utils";
import { INCOME_COLOR, EXPENSE_COLOR } from "@/lib/chart-colors";
import type { CashFlowRow } from "@/queries/dashboard";

interface CashFlowBarChartProps {
  data: CashFlowRow[];
  height?: number;
}

export function CashFlowBarChart({ data }: CashFlowBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Cash flow data will appear after your first sync.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" tickFormatter={formatMonthShort} tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
          width={60}
        />
        <Tooltip
          formatter={(v) => centsToDisplay(Number(v))}
          labelFormatter={(label) => formatMonthShort(String(label))}
        />
        <Legend />
        <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[2, 2, 0, 0]} />
        <Bar dataKey="expenses" name="Expenses" fill={EXPENSE_COLOR} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
