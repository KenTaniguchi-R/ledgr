import { centsToDisplay } from "@/lib/money";
import { StatStrip } from "@/components/molecules/stat-strip";
import type { PortfolioSummary } from "@/queries/investments";

interface PortfolioSummaryHeaderProps {
  summary: PortfolioSummary;
}

function signedDisplay(cents: number): string {
  const display = centsToDisplay(Math.abs(cents));
  return cents < 0 ? `-${display}` : `+${display}`;
}

export function PortfolioSummaryHeader({ summary }: PortfolioSummaryHeaderProps) {
  return (
    <StatStrip
      items={[
        { label: "Total Portfolio", value: centsToDisplay(summary.totalValue) },
        {
          label: "Day Change",
          value: summary.dayChange !== null ? signedDisplay(summary.dayChange) : "n/a",
          valueClassName:
            summary.dayChange !== null
              ? summary.dayChange >= 0
                ? "text-positive"
                : "text-destructive"
              : undefined,
        },
        {
          label: "Total Gain/Loss",
          value: signedDisplay(summary.totalGainLoss),
          valueClassName: summary.totalGainLoss >= 0 ? "text-positive" : "text-destructive",
        },
      ]}
    />
  );
}
