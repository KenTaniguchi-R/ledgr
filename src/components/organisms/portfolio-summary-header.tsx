import { SummaryCard } from "@/components/molecules/summary-card";
import type { PortfolioSummary } from "@/queries/investments";

interface PortfolioSummaryHeaderProps {
  summary: PortfolioSummary;
}

export function PortfolioSummaryHeader({ summary }: PortfolioSummaryHeaderProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <SummaryCard
        label="Total Portfolio"
        amount={summary.totalValue}
      />
      <SummaryCard
        label="Day Change"
        amount={summary.dayChange}
        variant={summary.dayChange !== null && summary.dayChange >= 0 ? "positive" : "negative"}
      />
      <SummaryCard
        label="Total Gain/Loss"
        amount={summary.totalGainLoss}
        variant={summary.totalGainLoss >= 0 ? "positive" : "negative"}
      />
    </div>
  );
}
