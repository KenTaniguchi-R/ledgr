import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ComparisonBadgeProps {
  current: number;
  previous: number;
  periodLabel: string;
}

export function ComparisonBadge({ current, previous, periodLabel }: ComparisonBadgeProps) {
  if (previous === 0) return null;

  const change = ((current - previous) / previous) * 100;
  const isUp = change > 0;
  const isFlat = Math.abs(change) < 0.5;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        isFlat
          ? "text-muted-foreground"
          : isUp
            ? "text-destructive"
            : "text-green-600"
      }`}
    >
      {isFlat ? (
        <Minus className="size-3" />
      ) : isUp ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {isFlat ? "0%" : `${change > 0 ? "+" : ""}${change.toFixed(0)}%`}
      <span className="text-muted-foreground">{periodLabel}</span>
    </span>
  );
}
