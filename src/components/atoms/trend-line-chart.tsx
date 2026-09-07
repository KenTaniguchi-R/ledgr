"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, LabelList } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { centsToDisplay } from "@/lib/money";
import { formatMonthShort } from "@/lib/date-utils";

interface TrendLineChartProps {
  data: Record<string, number | string>[];
  categories: { name: string; color: string }[];
}

/** Room on the right for the end-of-line labels. */
const LABEL_GUTTER = 96;

/**
 * Label only the final point of a series, so each line is named where it ends.
 * `LabelList` otherwise prints a number on every point, which is the thing the
 * dataviz rules call out: never a value on every mark.
 */
function endLabel(lastIndex: number, name: string) {
  return function EndLabel(props: { x?: string | number; y?: string | number; index?: number }) {
    const x = Number(props.x);
    const y = Number(props.y);
    if (props.index !== lastIndex || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return (
      <text x={x + 8} y={y} dy="0.32em" fontSize={11} fill="var(--muted-foreground)">
        {name}
      </text>
    );
  };
}

export function TrendLineChart({ data, categories: cats }: TrendLineChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No trend data available.
      </div>
    );
  }

  const lastIndex = data.length - 1;
  // Categories are user data, so their names are the series keys. They carry
  // spaces and ampersands, which would not survive being emitted as
  // `--color-<key>` custom properties — so the config names the series and the
  // stroke stays inline.
  const chartConfig: ChartConfig = Object.fromEntries(
    cats.map((cat) => [cat.name, { label: cat.name }]),
  );

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
      <LineChart data={data} margin={{ top: 5, right: LABEL_GUTTER, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="period" tickFormatter={formatMonthShort} tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
          tick={{ fontSize: 11 }}
          width={60}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(l) => formatMonthShort(String(l))}
              valueFormatter={(v) => centsToDisplay(Number(v))}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        {cats.map((cat) => (
          <Line
            key={cat.name}
            // Straight segments between the months that were actually measured.
            // A smoothed curve through monthly totals drew spending on days no
            // money moved — a lump sum on one day arced up mid-month and back.
            type="linear"
            dataKey={cat.name}
            name={cat.name}
            stroke={cat.color}
            strokeWidth={2}
            // The dots are the measurement; the line between them is inference.
            dot={{ r: 3, strokeWidth: 2, stroke: "var(--background)" }}
            activeDot={{ r: 5 }}
          >
            <LabelList dataKey={cat.name} content={endLabel(lastIndex, cat.name)} />
          </Line>
        ))}
      </LineChart>
    </ChartContainer>
  );
}
