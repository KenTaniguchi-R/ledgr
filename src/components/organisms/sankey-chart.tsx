"use client";

import { useId, useMemo, useState } from "react";
import { centsToDisplay } from "@/lib/money";
import { INCOME_COLOR } from "@/lib/chart-colors";
import { categoryColor, NEUTRAL_CATEGORY_COLOR, type CategoryColorMap } from "@/lib/category-colors";
import { activateOnKey } from "@/lib/a11y";

export interface SankeyNode {
  id: string;
  name: string;
  // "shortfall" (a source that makes up income the period didn't actually
  // have) and "savings" (a target for money left over) are synthetic nodes —
  // queries/reports.ts adds them so every source's outflow and every target's
  // inflow balance to the same grand total.
  type: "income" | "expense" | "savings" | "shortfall";
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyChartProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  categoryColors: CategoryColorMap;
  onNodeClick?: (nodeId: string, type: SankeyNode["type"]) => void;
}

// Layout is in SVG user units, not pixels — the element scales to whatever
// width its container gives it via `viewBox` + `aspect-ratio`.
const W = 1000;
const H = 440;
const NODE_W = 12;
const GAP = 8;
const PAD_T = 20;
const X_SOURCE = 300;
const X_HUB = 520;
const X_TARGET = 720;
const MAX_CATEGORIES = 8;
// Above this node height a label gets its own second line for the amount;
// below it the amount rides inline after the name.
const TWO_LINE_THRESHOLD = 26;

// Whole-dollar amounts for on-diagram labels — cents are too much precision
// for a label that already has a name and a percentage crowding it. Hover
// tooltips (`centsToDisplay`) still carry the exact cent amount.
function wholeDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function categoryIdFromExpenseId(nodeId: string): string | null {
  const raw = nodeId.replace(/^expense-/, "");
  return raw === "uncategorized" ? null : raw;
}

interface FlowEntry {
  /** Absent for the collapsed "Other" node, which represents several categories. */
  id?: string;
  name: string;
  type: SankeyNode["type"] | "other";
  value: number;
  color: string;
  hatched?: boolean;
  clickable: boolean;
  /** Appended to the amount line: "spent beyond income", "6 categories". */
  sub?: string;
  y: number;
  h: number;
}

/**
 * The Cash Flow tab's money-flow diagram: sources on the left, a single
 * "hub" bar in the middle standing for total spend (or total income, on a
 * surplus month), and destination categories on the right.
 *
 * This deliberately isn't a real many-to-many sankey — the query's
 * source-to-category links are a proportional allocation with no economic
 * meaning (which paycheck paid for which grocery run isn't a real question),
 * so drawing every one of those links the way `d3-sankey` would only dressed
 * up a made-up number as traceable money. Collapsing to one hub says the true
 * thing: money is fungible once it lands in the account.
 */
export function SankeyChart({ nodes, links, categoryColors, onNodeClick }: SankeyChartProps) {
  const patternId = useId();
  const [hovered, setHovered] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (nodes.length === 0 || links.length === 0) return null;

    const outflow = (id: string) =>
      links.filter((l) => l.source === id).reduce((s, l) => s + l.value, 0);
    const inflow = (id: string) =>
      links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0);

    const incomeEntries = nodes
      .filter((n) => n.type === "income")
      .map((n) => ({ node: n, value: outflow(n.id) }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
    const shortfallNode = nodes.find((n) => n.type === "shortfall");
    const shortfallValue = shortfallNode ? outflow(shortfallNode.id) : 0;

    const sources: FlowEntry[] = [
      ...incomeEntries.map(({ node, value }) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        value,
        color: INCOME_COLOR,
        clickable: true,
        y: 0,
        h: 0,
      })),
      ...(shortfallNode && shortfallValue > 0
        ? [
            {
              id: shortfallNode.id,
              name: shortfallNode.name,
              type: shortfallNode.type,
              value: shortfallValue,
              color: NEUTRAL_CATEGORY_COLOR,
              hatched: true,
              clickable: false,
              sub: "spent beyond income",
              y: 0,
              h: 0,
            },
          ]
        : []),
    ];

    const categoryEntries = nodes
      .filter((n) => n.type === "expense" && n.id !== "expense-uncategorized")
      .map((n) => ({ node: n, value: inflow(n.id) }))
      .filter((e) => e.value > 0)
      .sort((a, b) => b.value - a.value);
    const uncategorizedNode = nodes.find((n) => n.id === "expense-uncategorized");
    const uncategorizedValue = uncategorizedNode ? inflow(uncategorizedNode.id) : 0;
    const savingsNode = nodes.find((n) => n.type === "savings");
    const savingsValue = savingsNode ? inflow(savingsNode.id) : 0;

    const topCategories = categoryEntries.slice(0, MAX_CATEGORIES);
    const restCategories = categoryEntries.slice(MAX_CATEGORIES);
    const otherValue = restCategories.reduce((s, e) => s + e.value, 0);

    const targets: FlowEntry[] = [
      ...topCategories.map(({ node, value }) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        value,
        color: categoryColor(categoryColors, categoryIdFromExpenseId(node.id)),
        clickable: true,
        y: 0,
        h: 0,
      })),
      ...(uncategorizedNode && uncategorizedValue > 0
        ? [
            {
              id: uncategorizedNode.id,
              name: uncategorizedNode.name,
              type: uncategorizedNode.type,
              value: uncategorizedValue,
              color: NEUTRAL_CATEGORY_COLOR,
              hatched: true,
              clickable: true,
              y: 0,
              h: 0,
            },
          ]
        : []),
      ...(restCategories.length > 0
        ? [
            {
              name: "Other",
              type: "other" as const,
              value: otherValue,
              color: NEUTRAL_CATEGORY_COLOR,
              clickable: false,
              sub: `${restCategories.length} categor${restCategories.length === 1 ? "y" : "ies"}`,
              y: 0,
              h: 0,
            },
          ]
        : []),
      ...(savingsNode && savingsValue > 0
        ? [
            {
              id: savingsNode.id,
              name: savingsNode.name,
              type: savingsNode.type,
              value: savingsValue,
              color: INCOME_COLOR,
              clickable: false,
              y: 0,
              h: 0,
            },
          ]
        : []),
    ];

    if (sources.length === 0 || targets.length === 0) return null;

    const hubTotal = sources.reduce((s, e) => s + e.value, 0);
    if (hubTotal <= 0) return null;

    const avail = H - PAD_T * 2;
    // Each column gets its own value-per-unit-height scale (its node count
    // sets how much of `avail` the inter-node gaps eat), matching the
    // approved mock rather than forcing both columns onto one scale. The hub
    // bar reuses the source column's scale, since it visually continues from it.
    const place = (entries: FlowEntry[]) => {
      const k = (avail - GAP * (entries.length - 1)) / hubTotal;
      let y = PAD_T;
      for (const e of entries) {
        e.h = Math.max(e.value * k, 2);
        e.y = y;
        y += e.h + GAP;
      }
      return k;
    };
    const kSource = place(sources);
    const kTarget = place(targets);

    const hubH = avail - GAP * (sources.length - 1);
    const hubY = (H - hubH) / 2;

    return { sources, targets, kSource, kTarget, hubTotal, hubH, hubY };
  }, [nodes, links, categoryColors]);

  if (!layout) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        Not enough data for cash flow visualization.
      </div>
    );
  }

  const { sources, targets, kSource, kTarget, hubTotal, hubH, hubY } = layout;
  const shortfallPresent = sources.some((s) => s.type === "shortfall");

  function amountLine(entry: FlowEntry) {
    const pct = hubTotal > 0 ? Math.round((entry.value / hubTotal) * 100) : 0;
    return `${wholeDollars(entry.value)} · ${pct}%${entry.sub ? ` · ${entry.sub}` : ""}`;
  }

  function handleClick(entry: FlowEntry) {
    if (!entry.clickable || !entry.id || !onNodeClick) return;
    onNodeClick(entry.id, entry.type as SankeyNode["type"]);
  }

  function renderLabel(entry: FlowEntry, x: number, alignLeft: boolean) {
    const textX = alignLeft ? x - 8 : x + NODE_W + 8;
    const anchor = alignLeft ? "end" : "start";
    const cy = entry.y + entry.h / 2;
    if (entry.h > TWO_LINE_THRESHOLD) {
      return (
        <>
          <text x={textX} y={cy - 7} textAnchor={anchor} dominantBaseline="middle" className="text-[11px] fill-foreground">
            {entry.name}
          </text>
          <text x={textX} y={cy + 9} textAnchor={anchor} dominantBaseline="middle" className="text-[10px] fill-muted-foreground">
            {amountLine(entry)}
          </text>
        </>
      );
    }
    return (
      <text x={textX} y={cy} textAnchor={anchor} dominantBaseline="middle" className="text-[11px] fill-foreground">
        {entry.name} <tspan className="text-[10px] fill-muted-foreground">{amountLine(entry)}</tspan>
      </text>
    );
  }

  function renderNode(entry: FlowEntry, x: number, key: string) {
    const clickable = entry.clickable && Boolean(onNodeClick) && Boolean(entry.id);
    return (
      <rect
        x={x}
        y={entry.y}
        width={NODE_W}
        height={entry.h}
        rx={2}
        fill={entry.hatched ? `url(#${patternId})` : entry.color}
        stroke={entry.hatched ? NEUTRAL_CATEGORY_COLOR : undefined}
        tabIndex={clickable ? 0 : undefined}
        role={clickable ? "button" : undefined}
        aria-label={clickable ? `Show ${entry.name} transactions` : undefined}
        className={clickable ? "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" : undefined}
        onClick={clickable ? () => handleClick(entry) : undefined}
        onKeyDown={activateOnKey(clickable ? () => handleClick(entry) : undefined)}
        onMouseEnter={() => setHovered(key)}
        onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
      />
    );
  }

  function bandPath(x0: number, y0: number, x1: number, y1: number): string {
    const m = (x0 + x1) / 2;
    return `M${x0},${y0} C${m},${y0} ${m},${y1} ${x1},${y1}`;
  }

  function bandOpacity(key: string, hatched: boolean) {
    const base = hatched ? 0.22 : 0.3;
    if (hovered === null) return base;
    return hovered === key ? Math.min(base + 0.25, 0.65) : 0.08;
  }

  // Bands are drawn as one aggregated ribbon per source (into the hub) and
  // one per target (out of the hub), stacked along the hub's edge in the same
  // order as the columns beside them.
  const bands: { key: string; d: string; color: string; width: number; opacity: number; title: string }[] = [];
  let hy = hubY;
  for (const s of sources) {
    const width = s.value * kSource;
    const key = `src-${s.id ?? s.name}`;
    bands.push({
      key,
      d: bandPath(X_SOURCE + NODE_W, s.y + s.h / 2, X_HUB, hy + width / 2),
      color: s.color,
      width,
      opacity: bandOpacity(key, Boolean(s.hatched)),
      title: `${s.name}: ${centsToDisplay(s.value)}`,
    });
    hy += width;
  }
  let ty = hubY;
  for (const t of targets) {
    const width = t.value * kTarget;
    const key = `tgt-${t.id ?? t.name}`;
    bands.push({
      key,
      d: bandPath(X_HUB + NODE_W, ty + width / 2, X_TARGET, t.y + t.h / 2),
      color: t.color,
      width,
      opacity: bandOpacity(key, Boolean(t.hatched)),
      title: `${t.name}: ${centsToDisplay(t.value)}`,
    });
    ty += width;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[620px]"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="img"
        aria-label="Money flow from income sources, through total spending, to categories"
      >
        <defs>
          <pattern id={patternId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="3" height="7" fill={NEUTRAL_CATEGORY_COLOR} />
          </pattern>
        </defs>

        {bands.map((band) => (
          <path
            key={band.key}
            d={band.d}
            fill="none"
            stroke={band.color}
            strokeWidth={Math.max(band.width, 0.8)}
            strokeOpacity={band.opacity}
            onMouseEnter={() => setHovered(band.key)}
            onMouseLeave={() => setHovered((h) => (h === band.key ? null : h))}
          >
            <title>{band.title}</title>
          </path>
        ))}

        {sources.map((s) => (
          <g key={`s-${s.id ?? s.name}`}>
            {renderNode(s, X_SOURCE, `src-${s.id ?? s.name}`)}
            {renderLabel(s, X_SOURCE, true)}
          </g>
        ))}

        <rect x={X_HUB} y={hubY} width={NODE_W} height={hubH} rx={2} fill="var(--foreground)" opacity={0.8} />
        <text
          x={X_HUB + NODE_W / 2}
          y={hubY - 8}
          textAnchor="middle"
          className="text-[11px] fill-muted-foreground"
        >
          {shortfallPresent ? "Spent" : "Income"} {wholeDollars(hubTotal)}
        </text>

        {targets.map((t) => (
          <g key={`t-${t.id ?? t.name}`}>
            {renderNode(t, X_TARGET, `tgt-${t.id ?? t.name}`)}
            {renderLabel(t, X_TARGET, false)}
          </g>
        ))}
      </svg>
    </div>
  );
}
