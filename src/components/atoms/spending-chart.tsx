"use client";

import * as React from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, LabelList } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { centsToDisplay, centsToWholeDisplay } from "@/lib/money";
import { activateOnKey } from "@/lib/a11y";
import { CHART_COLORS } from "@/lib/chart-colors";
import { categoryColor, NEUTRAL_CATEGORY_COLOR, type CategoryColorMap } from "@/lib/category-colors";

export interface SpendingChartItem {
  id: string | null;
  name: string;
  value: number;
}

/** A grouped row this component builds for display; `synthetic` marks the rolled-up "Other" tail. */
interface GroupedItem extends SpendingChartItem {
  synthetic?: boolean;
}

interface SpendingChartProps {
  data: SpendingChartItem[];
  /**
   * The shared Reports colour map (see lib/category-colors.ts), so a category
   * keeps the same colour across the Spending, Cash Flow and Trends tabs.
   * Callers outside Reports (the dashboard widget, the Investments allocation
   * donut) have no such map to share and fall back to colouring by rank.
   */
  categoryColors?: CategoryColorMap;
  viewMode: "donut" | "bar";
  onItemClick?: (item: { id: string | null; name: string }) => void;
}

// Two rows take the neutral rather than a palette slot. "Other" (rolled up from
// categories past the top 8) is not a real category, and cycling back into
// the palette would collide with an earlier slice. Uncategorized is not a
// category either — it is the absence of one, and as the largest slice in most
// households it was taking the loudest palette colour, making "we do not know"
// the visual hero of the chart. Both render neutral so the same grouping and
// colours agree between the donut and bar views.
// In bar mode every row is the same series, so the row label names the measure
// and the tooltip header carries the category.
const BAR_CONFIG: ChartConfig = { value: { label: "Amount" } };

const NARROW_QUERY = "(max-width: 639px)";

function useIsNarrow(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(NARROW_QUERY);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

/**
 * Groups the full category list into the top 8 real categories by spend, the
 * Uncategorized bucket (if any), and an "Other" rollup of the rest — in that
 * order. Uncategorized never competes for a top-8 slot: it is a data-quality
 * gap, not a category, and letting it crowd out real ones there is how it
 * became the chart's de facto biggest wedge.
 */
function groupForChart(data: SpendingChartItem[]): GroupedItem[] {
  const uncategorized = data.find((d) => d.id === null);
  const named = data.filter((d) => d.id !== null).sort((a, b) => b.value - a.value);
  const top8 = named.slice(0, 8);
  const rest = named.slice(8);
  const otherTotal = rest.reduce((sum, d) => sum + d.value, 0);

  const grouped: GroupedItem[] = [...top8];
  if (uncategorized && uncategorized.value > 0) grouped.push(uncategorized);
  if (otherTotal > 0) {
    grouped.push({ id: null, name: `Other · ${rest.length} categories`, value: otherTotal, synthetic: true });
  }
  return grouped;
}

function colorFor(item: GroupedItem, index: number, categoryColors?: CategoryColorMap): string {
  if (item.synthetic) return NEUTRAL_CATEGORY_COLOR;
  if (categoryColors) return categoryColor(categoryColors, item.id);
  if (item.id === null) return NEUTRAL_CATEGORY_COLOR;
  return CHART_COLORS[index % CHART_COLORS.length];
}

/** Recharts YAxis tick that wraps a long category name onto up to two lines. Only used at phone width, where the axis is too narrow to fit most names on one. */
function WrappedTick({
  x,
  y,
  payload,
  maxWidth,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  maxWidth: number;
}) {
  const text = payload?.value ?? "";
  const charsPerLine = Math.max(6, Math.floor(maxWidth / 6.2));
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > charsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  const capped = lines.slice(0, 2);
  const lineHeight = 12;
  const startDy = -((capped.length - 1) * lineHeight) / 2 + 4;

  return (
    <text x={x} y={y} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">
      {capped.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? startDy : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function SpendingChart({ data, categoryColors, viewMode, onItemClick }: SpendingChartProps) {
  const isNarrow = useIsNarrow();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No spending data available.
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const chartData = groupForChart(data);

  function handleClick(index: number) {
    if (!onItemClick) return;
    const item = chartData[index];
    // "Other" spans several categories, which drill-down can't express — a null
    // id there would be read as uncategorized, so leave the slice inert.
    if (item && !item.synthetic) onItemClick({ id: item.id, name: item.name });
  }

  if (viewMode === "donut") {
    // Slices are user categories, so their names are the series keys — they
    // carry spaces and ampersands and cannot be emitted as `--color-<key>`
    // custom properties. The config names each slice; `Cell` keeps the colour.
    const donutConfig: ChartConfig = Object.fromEntries(
      chartData.map((item) => [item.name, { label: item.name }]),
    );

    return (
      <div className="flex gap-3 h-full">
        <div className="w-2/5 shrink-0">
          <ChartContainer config={donutConfig} className="aspect-auto h-full w-full">
            <PieChart>
              <defs>
                <pattern id="spendingHatchDonut" width={7} height={7} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="7" stroke={NEUTRAL_CATEGORY_COLOR} strokeWidth={1} opacity={0.6} />
                </pattern>
              </defs>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="55%"
                outerRadius="85%"
                onClick={(_, index) => handleClick(index)}
                className={onItemClick ? "cursor-pointer" : ""}
              >
                {chartData.map((item, i) => (
                  <Cell
                    key={i}
                    fill={item.id === null && !item.synthetic ? "url(#spendingHatchDonut)" : colorFor(item, i, categoryColors)}
                    fillOpacity={item.synthetic ? 0.55 : undefined}
                    stroke={item.id === null && !item.synthetic ? NEUTRAL_CATEGORY_COLOR : undefined}
                  />
                ))}
              </Pie>
              <ChartTooltip
                content={
                  <ChartTooltipContent hideLabel valueFormatter={(v) => centsToDisplay(Number(v))} />
                }
              />
            </PieChart>
          </ChartContainer>
        </div>
        <div className="w-3/5 overflow-y-auto overflow-x-hidden">
          {chartData.map((row, i) => (
            <SpendingLegendRow
              key={row.name}
              name={row.name}
              amount={row.value}
              percentage={total > 0 ? (row.value / total) * 100 : 0}
              color={colorFor(row, i, categoryColors)}
              hatched={row.id === null && !row.synthetic}
              onClick={onItemClick && !row.synthetic ? () => handleClick(i) : undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  const longestLabel = Math.max(...chartData.map((d) => d.name.length), 4);
  const desktopAxisWidth = Math.min(200, Math.max(90, Math.round(longestLabel * 6.4 + 20)));
  const axisWidth = isNarrow ? 96 : desktopAxisWidth;

  return (
    <ChartContainer config={BAR_CONFIG} className="aspect-auto h-full w-full">
      <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 48 }}>
        <defs>
          <pattern id="spendingHatchBar" width={7} height={7} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="7" stroke={NEUTRAL_CATEGORY_COLOR} strokeWidth={1} opacity={0.6} />
          </pattern>
        </defs>
        {/* The value axis is hidden, not removed: it still supplies the scale
            the bars are drawn against. Values are read from the direct labels
            at each bar's end instead. */}
        <XAxis type="number" hide domain={[0, "dataMax"]} />
        <YAxis
          type="category"
          dataKey="name"
          width={axisWidth}
          tickLine={false}
          axisLine={false}
          tick={isNarrow ? <WrappedTick maxWidth={axisWidth - 8} /> : { fontSize: 11 }}
        />
        <ChartTooltip
          content={<ChartTooltipContent valueFormatter={(v) => centsToDisplay(Number(v))} />}
        />
        <Bar
          dataKey="value"
          radius={2}
          onClick={(_, index) => handleClick(index)}
          className={onItemClick ? "cursor-pointer" : ""}
        >
          {chartData.map((item, i) => {
            const isUncategorized = item.id === null && !item.synthetic;
            return (
              <Cell
                key={i}
                fill={isUncategorized ? "url(#spendingHatchBar)" : colorFor(item, i, categoryColors)}
                fillOpacity={item.synthetic ? 0.55 : undefined}
                stroke={isUncategorized ? NEUTRAL_CATEGORY_COLOR : undefined}
                className={item.synthetic ? "cursor-default" : undefined}
              />
            );
          })}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: unknown) => centsToWholeDisplay(Number(v))}
            style={{ fontSize: 11, fill: "var(--foreground)" }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function SpendingLegendRow({
  name,
  amount,
  percentage,
  color,
  hatched,
  onClick,
}: {
  name: string;
  amount: number;
  percentage: number;
  color: string;
  hatched?: boolean;
  onClick?: () => void;
}) {
  return (
    // Recharts' sectors cannot take focus, so this legend is the keyboard route
    // into the donut. An inert row (no onClick, e.g. "Other") stays out of the
    // tab order.
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Show ${name} transactions` : undefined}
      className={`flex items-center gap-2 py-1 text-sm ${onClick ? "cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring rounded px-1 -mx-1" : ""}`}
      onClick={onClick}
      onKeyDown={activateOnKey(onClick)}
    >
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={
          hatched
            ? {
                backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 2px)`,
                boxShadow: `inset 0 0 0 1px ${color}`,
              }
            : { backgroundColor: color }
        }
      />
      <span className="truncate flex-1">{name}</span>
      <span className="font-medium tabular-nums">{centsToDisplay(amount)}</span>
      <span className="text-muted-foreground text-xs w-10 text-right">{percentage.toFixed(0)}%</span>
    </div>
  );
}
