import { centsToDisplay } from "@/lib/money";
import { InvestmentTypeBadge } from "@/components/atoms/investment-type-badge";
import { ComparisonBadge } from "@/components/molecules/comparison-badge";
import type { InvestmentHoldingRow } from "@/queries/investments";

interface HoldingRowProps {
  holding: InvestmentHoldingRow;
  onClick?: () => void;
}

function formatQuantity(qty: number): string {
  const str = qty.toFixed(4);
  return str.replace(/\.?0+$/, "");
}

export function HoldingRow({ holding, onClick }: HoldingRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid grid-cols-[minmax(80px,1fr)_2fr_80px_80px_100px_100px_100px_90px] gap-2 items-center h-10 px-3 text-sm hover:bg-muted/50 transition-colors w-full text-left border-b border-border/50"
    >
      <span className="font-medium tabular-nums truncate">{holding.ticker ?? "—"}</span>
      <span className="truncate text-muted-foreground">{holding.securityName}</span>
      <InvestmentTypeBadge type={holding.type} />
      <span className="tabular-nums text-right">{formatQuantity(holding.quantity)}</span>
      <span className="tabular-nums text-right">{centsToDisplay(holding.currentValue)}</span>
      <span className="tabular-nums text-right text-muted-foreground">
        {holding.costBasis !== null ? centsToDisplay(holding.costBasis) : "—"}
      </span>
      <span className="text-right">
        {holding.gainLossPercent !== null ? (
          <ComparisonBadge
            current={holding.currentValue}
            previous={holding.costBasis}
            pill
            invertColor
          />
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </span>
    </button>
  );
}
