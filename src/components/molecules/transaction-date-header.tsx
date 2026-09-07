import { AmountDisplay } from "@/components/atoms/amount-display";
import { dayCountLabel, type DaySummary } from "@/lib/transaction-day-summary";

interface TransactionDateHeaderProps {
  date: string;
  summary: DaySummary;
  currency?: string;
}

export function TransactionDateHeader({
  date,
  summary,
  currency = "USD",
}: TransactionDateHeaderProps) {
  const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 h-8 px-2 bg-background border-b group-data-[bulk-active]/list:top-14">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{formatted}</span>
      <span className="text-xs text-muted-foreground">·  {dayCountLabel(summary)}</span>
      {/* A day of nothing but transfers has no spending to net, and "+$0.00"
          beside "2 transfers" reads as a day that earned nothing rather than a
          day that was never counted. */}
      {summary.spendingCount > 0 && (
        <>
          <span className="text-xs text-muted-foreground">·</span>
          <AmountDisplay amount={summary.net} currency={currency} className="text-xs" />
        </>
      )}
    </div>
  );
}
