"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { centsToDisplay, centsToCompact } from "@/lib/money";
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

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
}

const AXIS_TICK = { fontSize: 11, fill: "var(--muted-foreground)" };

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  // The split single-mode series leaves one key null on either side of the
  // coverage boundary; Recharts still reports it, so drop the empty half
  // rather than rendering the same date twice.
  const entries = payload.filter((e) => e.value !== null && e.value !== undefined);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{formatDateShort(label ?? "")}</p>
      {entries.map((entry: TooltipEntry) => (
        <p key={entry.name} className="tabular-nums" style={{ color: entry.color }}>
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
    const points = data as SinglePoint[];
    const boundary = coverageBoundary(points.map((p) => ({ ...p, netWorth: p.value })));

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

    return (
      <ResponsiveContainer width="100%" height="100%">
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
            tickFormatter={centsToCompact}
            tick={AXIS_TICK}
            width={52}
            axisLine={false}
            tickLine={false}
            tickCount={4}
            domain={["auto", "auto"]}
          />
          <Tooltip content={<CustomTooltip />} />
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
            name={seriesName}
            fill="url(#portfolioGradient)"
            stroke={POSITIVE_COLOR}
            strokeWidth={2}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="partial"
            name={boundary.hasPartial ? "Tracked accounts only" : seriesName}
            stroke={boundary.hasPartial ? UNCOVERED_COLOR : POSITIVE_COLOR}
            strokeWidth={boundary.hasPartial ? 1.75 : 2}
            strokeDasharray={boundary.hasPartial ? "5 4" : undefined}
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
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
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="netWorth"
          name="Net Worth"
          fill="url(#netWorthGradient)"
          stroke={POSITIVE_COLOR}
          strokeWidth={2}
        />
        <Line type="monotone" dataKey="assets" name="Assets" stroke={INCOME_COLOR} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
        <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke={EXPENSE_COLOR} strokeWidth={1.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
