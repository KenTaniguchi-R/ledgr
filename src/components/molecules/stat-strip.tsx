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
