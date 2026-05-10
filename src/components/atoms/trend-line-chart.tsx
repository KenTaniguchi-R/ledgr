"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { CHART_COLORS } from "@/lib/chart-colors";

interface TrendLineChartProps {
  data: Record<string, number | string>[];
  categories: { name: string; color: string }[];
}

function formatMonth(month: string) {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "short" });
}

export function TrendLineChart({ data, categories: cats }: TrendLineChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No trend data available.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="period" tickFormatter={formatMonth} tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
          width={60}
        />
        <Tooltip formatter={(v) => centsToDisplay(Number(v))} labelFormatter={(l) => formatMonth(String(l))} />
        <Legend />
        {cats.map((cat) => (
          <Line
            key={cat.name}
            type="monotone"
            dataKey={cat.name}
            name={cat.name}
            stroke={cat.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
