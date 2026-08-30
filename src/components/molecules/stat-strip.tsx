import Link from "next/link";
import { cn } from "@/lib/utils";

export interface StatStripItem {
  label: string;
  value: string;
  valueClassName?: string;
  change?: {
    text: string;
    /** Whether the change moves the user's finances the right way. */
    good: boolean;
  };
  /**
   * Progress against a target. Deliberately neutral until exceeded: a green bar
   * is the app congratulating you and a red one is scolding you, and a ledger
   * does neither. Colour arrives only on an overrun, which is a fact rather
   * than a verdict.
   */
  rail?: { pct: number; exceeded: boolean };
  /** Plain supporting figures, shown instead of `change`. */
  footnote?: string;
  /** Offered when the tile needs configuration before it can say more. */
  footnoteHref?: { label: string; href: string };
}

interface StatStripProps {
  items: StatStripItem[];
  className?: string;
  ariaLabel?: string;
}

// Tailwind can't resolve dynamic class names, so map column count statically.
const GRID_COLS: Record<number, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

export function StatStrip({ items, className, ariaLabel }: StatStripProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "grid grid-cols-2 border-y divide-x divide-border",
        GRID_COLS[items.length],
        className,
      )}
    >
      {items.map((item, i) => (
        <div key={i} className="px-5 py-3.5 first:pl-0.5">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className={cn("text-xl font-semibold tracking-tight tabular-nums mt-0.5", item.valueClassName)}>
            {item.value}
          </p>
          {item.rail && (
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  item.rail.exceeded ? "bg-destructive" : "bg-muted-foreground/50",
                )}
                style={{ width: `${Math.max(0, Math.min(item.rail.pct, 100))}%` }}
              />
            </div>
          )}
          {item.footnote && (
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">{item.footnote}</p>
          )}
          {item.footnoteHref && (
            <Link
              href={item.footnoteHref.href}
              className="mt-0.5 inline-block text-xs text-primary hover:underline"
            >
              {item.footnoteHref.label}
            </Link>
          )}
          {item.change && (
            <p
              className={cn(
                "text-xs font-semibold mt-0.5",
                item.change.good ? "text-positive" : "text-destructive",
              )}
            >
              {item.change.text}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
