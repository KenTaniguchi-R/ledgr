"use client";

import { useMemo, useState } from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import { centsToDisplay } from "@/lib/money";
import { INCOME_COLOR, CHART_COLORS } from "@/lib/chart-colors";

export interface SankeyNode {
  id: string;
  name: string;
  type: "income" | "expense" | "savings";
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyChartProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
  onNodeClick?: (nodeId: string, type: "income" | "expense" | "savings") => void;
  height?: number;
}

interface LayoutNode extends SankeyNode {
  _index: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
}

interface LayoutLink {
  source: LayoutNode;
  target: LayoutNode;
  value: number;
  width?: number;
}

const SAVINGS_COLOR = "hsl(142 40% 60%)";

function getNodeColor(node: SankeyNode, expenseIdx: number): string {
  if (node.type === "income") return INCOME_COLOR;
  if (node.type === "savings") return SAVINGS_COLOR;
  return CHART_COLORS[expenseIdx % CHART_COLORS.length];
}

export function SankeyChart({ nodes, links, onNodeClick, height = 400 }: SankeyChartProps) {
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const layout = useMemo(() => {
    if (nodes.length === 0 || links.length === 0) return null;

    const nodeIndexMap = new Map(nodes.map((n, i) => [n.id, i]));
    const indexedLinks = links
      .filter((l) => nodeIndexMap.has(l.source) && nodeIndexMap.has(l.target) && l.value > 0)
      .map((l) => ({
        source: nodeIndexMap.get(l.source)!,
        target: nodeIndexMap.get(l.target)!,
        value: l.value,
      }));

    if (indexedLinks.length === 0) return null;

    const indexedNodes = nodes.map((n, i) => ({ ...n, _index: i }));

    const generator = sankey<SankeyNode & { _index: number }, { source: number; target: number; value: number }>()
      .nodeId((node) => node._index)
      .nodeWidth(20)
      .nodePadding(8)
      .extent([[0, 0], [600, height - 40]]);

    const result = generator({ nodes: indexedNodes, links: indexedLinks });
    return {
      nodes: result.nodes as LayoutNode[],
      links: result.links as unknown as LayoutLink[],
    };
  }, [nodes, links, height]);

  if (!layout || layout.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Not enough data for cash flow visualization.
      </div>
    );
  }

  const expenseIndexMap = new Map<string, number>();
  let idx = 0;
  for (const node of layout.nodes) {
    if (node.type === "expense") {
      expenseIndexMap.set(node.id, idx++);
    }
  }

  function expenseIdx(nodeId: string) {
    return expenseIndexMap.get(nodeId) ?? 0;
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 600 ${height - 40}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          {layout.links.map((link, i) => (
            <linearGradient
              key={i}
              id={`link-gradient-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={link.source.x1 ?? 0}
              x2={link.target.x0 ?? 0}
            >
              <stop offset="0%" stopColor={getNodeColor(link.source, 0)} />
              <stop offset="100%" stopColor={getNodeColor(link.target, expenseIdx(link.target.id))} />
            </linearGradient>
          ))}
        </defs>

        {layout.links.map((link, i) => {
          const path = sankeyLinkHorizontal()(link as never);
          if (!path) return null;
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={`url(#link-gradient-${i})`}
              strokeWidth={Math.max(link.width ?? 1, 1)}
              strokeOpacity={hoveredLink === i ? 0.4 : 0.15}
              onMouseEnter={(e) => {
                setHoveredLink(i);
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  text: `${link.source.name} → ${link.target.name}: ${centsToDisplay(link.value)}`,
                });
              }}
              onMouseLeave={() => {
                setHoveredLink(null);
                setTooltip(null);
              }}
            />
          );
        })}

        {layout.nodes.map((node) => {
          const x0 = node.x0 ?? 0;
          const y0 = node.y0 ?? 0;
          const x1 = node.x1 ?? 0;
          const y1 = node.y1 ?? 0;
          const nodeHeight = y1 - y0;
          const color = getNodeColor(node, expenseIdx(node.id));
          const clickable = onNodeClick && node.type !== "savings";
          return (
            <g key={node.id}>
              <rect
                x={x0} y={y0}
                width={x1 - x0} height={nodeHeight}
                fill={color} rx={2}
                className={clickable ? "cursor-pointer" : ""}
                onClick={() => clickable && onNodeClick(node.id, node.type)}
              />
              {nodeHeight > 12 && (
                <text
                  x={node.type === "income" ? x0 - 4 : x1 + 4}
                  y={(y0 + y1) / 2}
                  dy="0.35em"
                  textAnchor={node.type === "income" ? "end" : "start"}
                  className="text-[10px] fill-foreground"
                >
                  {node.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="fixed z-50 rounded-md border bg-popover px-3 py-1.5 text-xs shadow-md pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
