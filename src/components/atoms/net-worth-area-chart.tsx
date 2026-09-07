"use client";

import * as React from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { centsToDisplay, centsToCompact, axisTickFormatter } from "@/lib/money";
import { formatDateShort } from "@/lib/date-utils";
import { INCOME_COLOR, EXPENSE_COLOR, POSITIVE_COLOR, UNCOVERED_COLOR } from "@/lib/chart-colors";
import { coverageBoundary } from "@/lib/net-worth-coverage";
import type { NetWorthSeriesPoint } from "@/queries/dashboard";

type ChartDataPoint = Record<string, string | number | null>;

/** Reports pass points without coverage fields; the dashboard passes them. */
interface SinglePoint {
  date: string;
  value: number;
  coveredAccounts?: number;
  totalAccounts?: number;
}

interface NetWorthAreaChartProps {
  data: NetWorthSeriesPoint[] | SinglePoint[];
  height?: number;
  mode?: "multi" | "single";
  seriesName?: string;
}

const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };

const MULTI_CONFIG = {
  netWorth: { label: "Net Worth", color: POSITIVE_COLOR },
  assets: { label: "Assets", color: INCOME_COLOR },
  liabilities: { label: "Liabilities", color: EXPENSE_COLOR },
} satisfies ChartConfig;

/**
 * The split single-mode series leaves one key null on either side of the
 * coverage boundary; Recharts still reports it, so drop the empty half rather
 * than rendering the same date twice with a blank value.
 */
function DenseTooltipContent({
  payload,
  ...props
}: React.ComponentProps<typeof ChartTooltipContent>) {
  const entries = payload?.filter((e) => e.value !== null && e.value !== undefined);
  if (!entries?.length) return null;
  return <ChartTooltipContent {...props} payload={entries} />;
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
    const points = data as SinglePoint[];
    const boundary = coverageBoundary(points.map((p) => ({ ...p, netWorth: p.value })));
    const formatTick = axisTickFormatter(points.map((p) => p.value));

    // Split the series at the boundary so the stretch that isn't yet net worth
    // renders as a muted dashed line instead of a confident solid one. The
    // boundary point belongs to BOTH keys, or the two segments would not meet.
    //
    // Three shapes to cover: no partial span (everything solid — reports, and
    // any household with even history), a partial span that resolves (split at
    // the boundary), and coverage that never completes (everything dashed).
    const neverCompletes = boundary.index === -1;
    const split: ChartDataPoint[] = points.map((p, i) => {
      if (!boundary.hasPartial) return { date: p.date, partial: null, covered: p.value };
      if (neverCompletes) return { date: p.date, partial: p.value, covered: null };
      return {
        date: p.date,
        partial: i <= boundary.index ? p.value : null,
        covered: i >= boundary.index ? p.value : null,
      };
    });

    const singleConfig: ChartConfig = {
      covered: { label: seriesName, color: POSITIVE_COLOR },
      partial: {
        label: boundary.hasPartial ? "Tracked accounts only" : seriesName,
        color: boundary.hasPartial ? UNCOVERED_COLOR : POSITIVE_COLOR,
      },
    };

    return (
      <ChartContainer config={singleConfig} className="aspect-auto h-full w-full">
        <ComposedChart data={split} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={POSITIVE_COLOR} stopOpacity={0.25} />
              <stop offset="100%" stopColor={POSITIVE_COLOR} stopOpacity={0} />
            </linearGradient>
            <pattern id="uncoveredHatch" width={7} height={7} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="7" stroke={UNCOVERED_COLOR} strokeWidth={1} opacity={0.28} />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={formatDateShort} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={48} />
          <YAxis
            tickFormatter={formatTick}
            tick={AXIS_TICK}
            width={68}
            axisLine={false}
            tickLine={false}
            tickCount={4}
            domain={["auto", "auto"]}
          />
          <ChartTooltip
            content={
              <DenseTooltipContent
                labelFormatter={(label) => formatDateShort(String(label))}
                valueFormatter={(v) => centsToDisplay(Number(v))}
              />
            }
          />
          {boundary.hasPartial && boundary.date && (
            <ReferenceArea
              x1={points[0].date}
              x2={boundary.date}
              fill="url(#uncoveredHatch)"
              stroke="none"
              ifOverflow="extendDomain"
            />
          )}
          {boundary.hasPartial && boundary.date && (
            <ReferenceLine x={boundary.date} stroke={POSITIVE_COLOR} strokeWidth={1.5} />
          )}
          <Area
            type="monotone"
            dataKey="covered"
            fill="url(#portfolioGradient)"
            stroke="var(--color-covered)"
            strokeWidth={2}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="partial"
            stroke="var(--color-partial)"
            strokeWidth={boundary.hasPartial ? 1.75 : 2}
            strokeDasharray={boundary.hasPartial ? "5 4" : undefined}
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer config={MULTI_CONFIG} className="aspect-auto h-full w-full">
      <ComposedChart data={data as unknown as ChartDataPoint[]} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <defs>
          <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={POSITIVE_COLOR} stopOpacity={0.25} />
            <stop offset="100%" stopColor={POSITIVE_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="date" tickFormatter={formatDateShort} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={48} />
        <YAxis
          tickFormatter={centsToCompact}
          tick={AXIS_TICK}
          width={52}
          axisLine={false}
          tickLine={false}
          tickCount={4}
          domain={["auto", "auto"]}
        />
        <ChartTooltip
          content={
            <DenseTooltipContent
              labelFormatter={(label) => formatDateShort(String(label))}
              valueFormatter={(v) => centsToDisplay(Number(v))}
            />
          }
        />
        {/* Three series identified by colour alone, and only on hover, until
            this. A legend is not optional past one series. */}
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="netWorth"
          fill="url(#netWorthGradient)"
          stroke="var(--color-netWorth)"
          strokeWidth={2}
        />
        <Line type="monotone" dataKey="assets" stroke="var(--color-assets)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
        <Line type="monotone" dataKey="liabilities" stroke="var(--color-liabilities)" strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
