"use client";

import { useMemo, useState } from "react";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import type { SankeyNode as D3SankeyNode, SankeyLink as D3SankeyLink } from "d3-sankey";
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

// Internal link type used by d3-sankey when nodeId returns a number index
interface IndexedLink {
  source: number;
  target: number;
  value: number;
}

type LayoutNode = D3SankeyNode<SankeyNode & { _index: number }, IndexedLink>;
type LayoutLink = D3SankeyLink<SankeyNode & { _index: number }, IndexedLink>;

const SAVINGS_COLOR = "hsl(142 40% 60%)";

function getNodeColor(node: SankeyNode, index: number): string {
  if (node.type === "income") return INCOME_COLOR;
  if (node.type === "savings") return SAVINGS_COLOR;
  return CHART_COLORS[index % CHART_COLORS.length];
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

    // Assign a stable index to each node so nodeId can return it
    const indexedNodes = nodes.map((n, i) => ({ ...n, _index: i }));

    const generator = sankey<SankeyNode & { _index: number }, IndexedLink>()
      .nodeId((node) => node._index)
      .nodeWidth(20)
      .nodePadding(8)
      .extent([[0, 0], [600, height - 40]]);

    return generator({
      nodes: indexedNodes,
      links: indexedLinks,
    });
  }, [nodes, links, height]);

  if (!layout || layout.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Not enough data for cash flow visualization.
      </div>
    );
  }

  const expenseIndex = new Map<string, number>();
  let ei = 0;
  for (const node of layout.nodes) {
    if ((node as unknown as SankeyNode).type === "expense") {
      expenseIndex.set((node as unknown as SankeyNode).id, ei++);
    }
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <svg viewBox={`0 0 600 ${height - 40}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          {(layout.links as unknown as LayoutLink[]).map((link, i) => {
            const sourceNode = link.source as LayoutNode;
            const targetNode = link.target as LayoutNode;
            const sourceData = sourceNode as unknown as SankeyNode;
            const targetData = targetNode as unknown as SankeyNode;
            const sColor = getNodeColor(sourceData, 0);
            const tColor = getNodeColor(targetData, expenseIndex.get(targetData.id) ?? 0);
            return (
              <linearGradient key={i} id={`link-gradient-${i}`} gradientUnits="userSpaceOnUse"
                x1={(sourceNode.x1 ?? 0)} x2={(targetNode.x0 ?? 0)}>
                <stop offset="0%" stopColor={sColor} />
                <stop offset="100%" stopColor={tColor} />
              </linearGradient>
            );
          })}
        </defs>

        {(layout.links as unknown as LayoutLink[]).map((link, i) => {
          const path = sankeyLinkHorizontal()(link as never);
          if (!path) return null;
          const sourceData = (link.source as LayoutNode) as unknown as SankeyNode;
          const targetData = (link.target as LayoutNode) as unknown as SankeyNode;
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={`url(#link-gradient-${i})`}
              strokeWidth={Math.max((link as { width?: number }).width ?? 1, 1)}
              strokeOpacity={hoveredLink === i ? 0.4 : 0.15}
              onMouseEnter={(e) => {
                setHoveredLink(i);
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  text: `${sourceData.name} → ${targetData.name}: ${centsToDisplay(link.value)}`,
                });
              }}
              onMouseLeave={() => {
                setHoveredLink(null);
                setTooltip(null);
              }}
            />
          );
        })}

        {(layout.nodes as LayoutNode[]).map((node) => {
          const nodeData = node as unknown as SankeyNode;
          const x0 = node.x0 ?? 0;
          const y0 = node.y0 ?? 0;
          const x1 = node.x1 ?? 0;
          const y1 = node.y1 ?? 0;
          const color = getNodeColor(nodeData, expenseIndex.get(nodeData.id) ?? 0);
          const nodeHeight = y1 - y0;
          return (
            <g key={nodeData.id}>
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={nodeHeight}
                fill={color}
                rx={2}
                className={onNodeClick && nodeData.type !== "savings" ? "cursor-pointer" : ""}
                onClick={() => onNodeClick && nodeData.type !== "savings" && onNodeClick(nodeData.id, nodeData.type)}
              />
              {nodeHeight > 12 && (
                <text
                  x={nodeData.type === "income" ? x0 - 4 : x1 + 4}
                  y={(y0 + y1) / 2}
                  dy="0.35em"
                  textAnchor={nodeData.type === "income" ? "end" : "start"}
                  className="text-[10px] fill-foreground"
                >
                  {nodeData.name}
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
