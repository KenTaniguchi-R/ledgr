"use client";

import { CashFlowBarChart } from "@/components/atoms/cash-flow-bar-chart";
import type { CashFlowRow } from "@/queries/dashboard";

interface CashFlowChartProps {
  data: CashFlowRow[];
}

export function CashFlowChart({ data }: CashFlowChartProps) {
  return <CashFlowBarChart data={data} />;
}
