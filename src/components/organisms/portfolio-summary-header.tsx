import { centsToDisplay } from "@/lib/money";
import { StatStrip, type StatStripItem } from "@/components/molecules/stat-strip";
import type { PortfolioSummary } from "@/queries/investments";

interface PortfolioSummaryHeaderProps {
  summary: PortfolioSummary;
}

function signedDisplay(cents: number): string {
  const display = centsToDisplay(Math.abs(cents));
  return cents < 0 ? `-${display}` : `+${display}`;
}

export function PortfolioSummaryHeader({ summary }: PortfolioSummaryHeaderProps) {
  const items: StatStripItem[] = [
    { label: "Total Portfolio", value: centsToDisplay(summary.totalValue) },
  ];

  // Only worth a column when there is a gap to explain. Showing a permanent
  // "$0.00" cash tile would spend a quarter of the strip on nothing.
  if (summary.cashValue > 0) {
    items.push({
      label: "Cash / Unallocated",
      value: centsToDisplay(summary.cashValue),
    });
  }

  items.push(
    {
      // Derived from holdings_history, so it can only ever describe the
      // itemized part. The label says so rather than implying whole-portfolio.
      label: "Day Change (holdings)",
      value: summary.dayChange !== null ? signedDisplay(summary.dayChange) : "n/a",
      valueClassName:
        summary.dayChange !== null
          ? summary.dayChange >= 0
            ? "text-positive"
            : "text-destructive"
          : undefined,
    },
    {
      // Spans only holdings that report a cost basis. Zero-basis positions
      // would otherwise contribute their entire value as gain.
      label: "Gain/Loss (with cost basis)",
      value: signedDisplay(summary.totalGainLoss),
      valueClassName: summary.totalGainLoss >= 0 ? "text-positive" : "text-destructive",
    },
  );

  return <StatStrip items={items} />;
}
