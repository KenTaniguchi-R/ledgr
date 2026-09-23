import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { comparisonState, comparisonTone } from "@/lib/comparison-state";
import { centsToWholeDisplay } from "@/lib/money";

interface ComparisonBadgeProps {
  current: number;
  previous: number | null;
  periodLabel?: string;
  pill?: boolean;
  invertColor?: boolean;
  /**
   * "pill" (default) is the original single-line percent badge, used by the
   * investments tables. "stacked" is a two-line, dollar-first block for a
   * table's Change column: the absolute delta on top, the percent (or a
   * "37× prior" multiple past 10x) underneath — see Reports > Spending.
   */
  variant?: "pill" | "stacked";
}

export function ComparisonBadge({
  current,
  previous,
  periodLabel,
  pill,
  invertColor,
  variant = "pill",
}: ComparisonBadgeProps) {
  const state = comparisonState(current, previous);

  // A category with no baseline row is new. It used to render as an empty cell,
  // which read exactly like "no change".
  if (state.kind === "new") {
    if (variant === "stacked") {
      return (
        <span className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
          New
        </span>
      );
    }
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
  const tone = comparisonTone(state, invertColor);
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;

  if (variant === "stacked") {
    // previous is guaranteed non-null and non-zero here — comparisonState
    // only reaches "up"/"down"/"flat" with a real baseline.
    const ratio = current / (previous as number);
    const toneClass = tone === "neutral" ? "text-muted-foreground" : tone === "bad" ? "text-destructive" : "text-positive";
    const bottom = isFlat
      ? "flat"
      : ratio >= 10
        ? `${Math.round(ratio)}× prior`
        : `${change > 0 ? "+" : ""}${Math.round(change)}%`;

    return (
      <span className="inline-flex flex-col items-end leading-tight">
        <span className={`inline-flex items-center gap-1 text-sm font-medium tabular-nums ${toneClass}`}>
          <Icon className="size-3" />
          {centsToWholeDisplay(Math.abs(current - (previous as number)))}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">{bottom}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        tone === "neutral"
          ? "text-muted-foreground"
          : tone === "bad"
            ? "text-destructive"
            : "text-green-600"
      }${pill ? " rounded-full bg-muted px-2 py-0.5" : ""}`}
    >
      <Icon className="size-3" />
      {isFlat ? "0%" : `${change > 0 ? "+" : ""}${change.toFixed(0)}%`}
      {periodLabel && <span className="text-muted-foreground">{periodLabel}</span>}
    </span>
  );
}
