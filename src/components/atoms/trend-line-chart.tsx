"use client";

import { useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, LabelList } from "recharts";
import type { TooltipContentProps, TooltipPayloadEntry } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { centsToDisplay } from "@/lib/money";
import { formatMonthShort } from "@/lib/date-utils";

export interface TrendCategory {
  /** Pivot key on each row of `data` — categoryId, or the uncategorized key. */
  key: string;
  name: string;
  color: string;
  /**
   * A dash pattern for the *non-partial* stretch of this line. Only set when
   * this category's colour collides with another selected one (two neutrals
   * picked at once) — colour alone no longer tells them apart, so the line
   * itself has to.
   */
  dashPattern?: string;
}

interface TrendLineChartProps {
  /** Pivoted rows: `{ period: "YYYY-MM", [category.key]: cents, ... }`. */
  data: Record<string, number | string>[];
  categories: TrendCategory[];
  /** Calendar months the selected range doesn't cover from the 1st to the last day. */
  partialPeriods: ReadonlySet<string>;
}

/** Room on the right for the end-of-line labels. */
const LABEL_GUTTER = 96;
/**
 * Dash for a segment touching a partial month. Takes priority over a
 * category's own identity dash — that dash only has to do work in the
 * segments between two full months, since partial-ness is the more urgent
 * thing to flag right there.
 */
const PARTIAL_DASH = "5 4";
/** Minimum vertical gap kept between two end-of-line labels. */
const LABEL_MIN_GAP = 14;

function monthTick(partialPeriods: ReadonlySet<string>) {
  return (period: string) =>
    partialPeriods.has(period) ? `${formatMonthShort(period)} (partial)` : formatMonthShort(period);
}

/**
 * Hollow for a partial-month point, filled otherwise — the point is the
 * measurement, so its completeness is marked at the point, not only on the
 * line touching it.
 */
function segmentDot(color: string, partialPeriods: ReadonlySet<string>) {
  return function SegmentDot(props: { cx?: number; cy?: number; payload?: { period?: string } }) {
    const { cx, cy, payload } = props;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    const partial = payload?.period ? partialPeriods.has(payload.period) : false;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={partial ? 3 : 3.5}
        fill={partial ? "var(--background)" : color}
        stroke={color}
        strokeWidth={1.8}
      />
    );
  };
}

/**
 * Labels only the final point of a series, so each line is named where it
 * actually ends. The `data-trend-end-label` marker is how the de-overlap pass
 * below finds these afterwards.
 */
function endLabel(lastIndex: number, name: string, color: string) {
  return function EndLabel(props: { x?: string | number; y?: string | number; index?: number }) {
    const x = Number(props.x);
    const y = Number(props.y);
    // Matched by position: LabelList hands content the point's index, not its row.
    if (props.index !== lastIndex || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    return (
      <text data-trend-end-label="true" data-y={y} x={x + 8} y={y} dy="0.32em" fontSize={11} fill={color}>
        {name}
      </text>
    );
  };
}

/** Series-key suffixes for the dashed stretches touching a partial first / last month. */
const PARTIAL_START = "__partialStart";
const PARTIAL_END = "__partialEnd";

/**
 * One tooltip row per category. A boundary month sits on both the solid and a
 * dashed series of the same category, so it is reported twice.
 */
function dedupeByName(payload: readonly TooltipPayloadEntry[]): TooltipPayloadEntry[] {
  const seen = new Set<TooltipPayloadEntry["name"]>();
  return payload.filter((item) => {
    if (item.value === null || item.value === undefined) return false;
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

/**
 * Split each category into up to three series over the SAME rows: a solid run
 * across the fully covered months, and dashed runs for the segment into a
 * partial first month and out to a partial last month. Every series is `null`
 * outside its stretch, and the boundary month belongs to both neighbours so
 * the pieces meet.
 *
 * Drawing each segment as its own <Line data={[a, b]}> looked equivalent but
 * isn't: Recharts appends every per-line `data` override to the category
 * axis, so the x-axis repeated "Jun (partial) Jul Jul Aug Aug …" once per
 * line and all lines bunched up at its left edge.
 */
function splitAtPartialMonths(
  data: Record<string, number | string>[],
  keys: string[],
  partialPeriods: ReadonlySet<string>,
) {
  const n = data.length;
  const startPartial = n > 1 && partialPeriods.has(String(data[0].period));
  const endPartial = n > 1 && partialPeriods.has(String(data[n - 1].period));
  const solidFrom = startPartial ? 1 : 0;
  const solidTo = endPartial ? n - 2 : n - 1;

  const rows = data.map((row, i) => {
    const out: Record<string, number | string | null> = { period: row.period };
    for (const key of keys) {
      const v = row[key] ?? 0;
      out[key] = i >= solidFrom && i <= solidTo ? v : null;
      out[key + PARTIAL_START] = startPartial && i <= 1 ? v : null;
      out[key + PARTIAL_END] = endPartial && i >= n - 2 ? v : null;
    }
    return out;
  });
  return { rows, startPartial, endPartial, hasSolid: solidFrom <= solidTo };
}

export function TrendLineChart({ data, categories: cats, partialPeriods }: TrendLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Recharts lays each end label out independently per line, so two series
  // that finish close together in value print on top of each other. This
  // nudges the lower one down after layout, the same fix the approved mock
  // does directly in SVG.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const spread = () => {
      const labels = Array.from(root.querySelectorAll<SVGTextElement>("text[data-trend-end-label]"));
      if (labels.length < 2) return;
      const entries = labels
        .map((el) => ({ el, y: parseFloat(el.getAttribute("data-y") ?? el.getAttribute("y") ?? "0") }))
        .sort((a, b) => a.y - b.y);
      for (let i = 1; i < entries.length; i++) {
        const minY = entries[i - 1].y + LABEL_MIN_GAP;
        if (entries[i].y < minY) entries[i].y = minY;
      }
      // Lines that all end near $0 would be pushed down into the x-axis
      // ticks; shift the stack back up so the lowest label sits on the axis.
      const axis = root.querySelector(".recharts-xAxis .recharts-cartesian-axis-line");
      const floor = axis ? parseFloat(axis.getAttribute("y1") ?? "NaN") : NaN;
      if (Number.isFinite(floor)) {
        // Walk back up from the floor, moving only labels that would overlap
        // the one below them — a label far above the crowd stays on its line.
        let limit = floor;
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].y > limit) entries[i].y = limit;
          limit = entries[i].y - LABEL_MIN_GAP;
        }
      }
      entries.forEach(({ el, y }) => el.setAttribute("y", String(y)));
    };
    // Recharts draws the labels after its own layout pass, which lands after
    // this effect, so re-run whenever label nodes are (re)inserted. Only
    // childList is observed: rewriting `y` above must not retrigger this.
    spread();
    const observer = new MutationObserver(spread);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [data, cats]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No trend data available.
      </div>
    );
  }

  const { rows, startPartial, endPartial, hasSolid } = splitAtPartialMonths(
    data,
    cats.map((c) => c.key),
    partialPeriods,
  );

  // Categories are user data, so their names are the series keys shown in the
  // tooltip. They carry spaces and ampersands, which would not survive being
  // emitted as `--color-<key>` custom properties — so the config only names
  // the series and the stroke stays inline.
  const chartConfig: ChartConfig = Object.fromEntries(
    cats.flatMap((cat) =>
      [cat.key, cat.key + PARTIAL_START, cat.key + PARTIAL_END].map((k) => [k, { label: cat.name }]),
    ),
  );

  return (
    <div ref={containerRef} className="h-full w-full">
      <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
        <LineChart data={rows} margin={{ top: 5, right: LABEL_GUTTER, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="period" tickFormatter={monthTick(partialPeriods)} tick={{ fontSize: 11 }} />
          <YAxis
            tickFormatter={(v) => centsToDisplay(v).replace(/\.00$/, "")}
            tick={{ fontSize: 11 }}
            width={60}
          />
          <ChartTooltip
            content={({ active, payload, label }: TooltipContentProps) => (
              <ChartTooltipContent
                active={active}
                payload={dedupeByName(payload)}
                label={label}
                labelFormatter={(l) => {
                  const period = String(l);
                  return partialPeriods.has(period)
                    ? `${formatMonthShort(period)} · partial month`
                    : formatMonthShort(period);
                }}
                valueFormatter={(v) => centsToDisplay(Number(v))}
              />
            )}
          />
          {cats.flatMap((cat) => {
            // Which series draws the last point, and so carries the end label.
            const endKey = endPartial ? cat.key + PARTIAL_END : cat.key;
            const series = [
              hasSolid && { dataKey: cat.key, dash: cat.dashPattern },
              startPartial && { dataKey: cat.key + PARTIAL_START, dash: PARTIAL_DASH },
              endPartial && { dataKey: cat.key + PARTIAL_END, dash: PARTIAL_DASH },
            ].filter((x): x is { dataKey: string; dash: string | undefined } => Boolean(x));
            return series.map(({ dataKey, dash }) => (
              <Line
                key={dataKey}
                // Straight segments between the months that were actually
                // measured. A smoothed curve through monthly totals drew
                // spending on days no money moved.
                type="linear"
                dataKey={dataKey}
                name={cat.name}
                stroke={cat.color}
                strokeWidth={2}
                strokeDasharray={dash}
                connectNulls={false}
                dot={segmentDot(cat.color, partialPeriods)}
                activeDot={{ r: 5 }}
                isAnimationActive={false}
                legendType="none"
              >
                {dataKey === endKey && (
                  <LabelList dataKey={dataKey} content={endLabel(rows.length - 1, cat.name, cat.color)} />
                )}
              </Line>
            ));
          })}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
