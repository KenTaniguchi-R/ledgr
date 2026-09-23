import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ReportStat {
  label: React.ReactNode;
  value: React.ReactNode;
  /** One quiet line under the figure: a comparison, a caveat, a breakdown. */
  sub?: React.ReactNode;
  /** Semantic colour for the figure. Spending itself is `default`, not alarm-red. */
  tone?: "default" | "positive" | "negative";
  /** A control that acts on this figure, e.g. "Review" for uncategorized spend. */
  action?: React.ReactNode;
}

const TONE: Record<NonNullable<ReportStat["tone"]>, string> = {
  default: "",
  positive: "text-positive",
  negative: "text-destructive",
};

const COLS: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/**
 * The summary row at the top of every Reports tab: one card, one cell per
 * figure, hairlines between cells. It replaced a row of separate bordered
 * tiles, each with an icon badge, that repeated the same chrome three or four
 * times for what is one statement ("this is the period in numbers").
 *
 * On narrow screens the cells fall into two columns; with an odd count the
 * first (headline) cell takes the full width.
 */
export function ReportStatStrip({ items }: { items: ReportStat[] }) {
  const odd = items.length % 2 === 1;
  return (
    <Card className="gap-0 py-0">
      <dl className={cn("grid grid-cols-2 gap-px bg-border", COLS[items.length])}>
        {items.map((item, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col gap-1 bg-card px-4 py-4 sm:px-5",
              odd && i === 0 && "col-span-2 lg:col-span-1",
            )}
          >
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd
              className={cn(
                "tabular-nums font-semibold tracking-tight",
                i === 0 ? "text-2xl" : "text-xl",
                TONE[item.tone ?? "default"],
              )}
            >
              {item.value}
            </dd>
            {item.sub && <dd className="text-xs text-muted-foreground tabular-nums">{item.sub}</dd>}
            {item.action && <dd className="mt-1">{item.action}</dd>}
          </div>
        ))}
      </dl>
    </Card>
  );
}
