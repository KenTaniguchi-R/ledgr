import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { comparisonState } from "@/lib/comparison-state";

interface ComparisonBadgeProps {
  current: number;
  previous: number | null;
  periodLabel?: string;
  pill?: boolean;
  invertColor?: boolean;
}

export function ComparisonBadge({ current, previous, periodLabel, pill, invertColor }: ComparisonBadgeProps) {
  const state = comparisonState(current, previous);

  // A category with no baseline row is new. It used to render as an empty cell,
  // which read exactly like "no change".
  if (state.kind === "new") {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs text-muted-foreground${
          pill ? " rounded-full bg-muted px-2 py-0.5" : ""
        }`}
      >
        New
      </span>
    );
  }

  const change = state.percent;
  const isUp = state.kind === "up";
  const isFlat = state.kind === "flat";

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
