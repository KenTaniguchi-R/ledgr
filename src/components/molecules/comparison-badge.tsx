import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ComparisonBadgeProps {
  current: number;
  previous: number | null;
  periodLabel?: string;
  pill?: boolean;
  invertColor?: boolean;
}

export function ComparisonBadge({ current, previous, periodLabel, pill, invertColor }: ComparisonBadgeProps) {
  if (previous === null || previous === 0) {
    if (pill) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground rounded-full bg-muted px-2 py-0.5">
          —
        </span>
      );
    }
    return null;
  }

  const change = ((current - previous) / previous) * 100;
  const isUp = change > 0;
  const isFlat = Math.abs(change) < 0.5;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        isFlat
          ? "text-muted-foreground"
          : (isUp !== invertColor)
            ? "text-destructive"
            : "text-green-600"
      }${pill ? " rounded-full bg-muted px-2 py-0.5" : ""}`}
    >
      {isFlat ? (
        <Minus className="size-3" />
      ) : isUp ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {isFlat ? "0%" : `${change > 0 ? "+" : ""}${change.toFixed(0)}%`}
      {periodLabel && <span className="text-muted-foreground">{periodLabel}</span>}
    </span>
  );
}
