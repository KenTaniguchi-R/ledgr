"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { centsToDisplay } from "@/lib/money";
import { formatMonthShort } from "@/lib/date-utils";

interface TrendLineChartProps {
  data: Record<string, number | string>[];
  categories: { name: string; color: string }[];
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
        <XAxis dataKey="period" tickFormatter={formatMonthShort} tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
          width={60}
        />
        <Tooltip formatter={(v) => centsToDisplay(Number(v))} labelFormatter={(l) => formatMonthShort(String(l))} />
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
