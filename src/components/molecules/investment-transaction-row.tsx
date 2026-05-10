import { centsToDisplay } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/date-utils";
import type { InvTxnRow } from "@/queries/investments";

const TYPE_COLORS: Record<string, string> = {
  buy: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  sell: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  dividend: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  fee: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  transfer: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
};

interface InvestmentTransactionRowProps {
  transaction: InvTxnRow;
}

export function InvestmentTransactionRow({ transaction }: InvestmentTransactionRowProps) {
  const typeColor = TYPE_COLORS[transaction.type ?? "other"] ?? TYPE_COLORS.other;

  return (
    <div className="grid grid-cols-[90px_70px_2fr_100px_100px] gap-2 items-center h-10 px-3 text-sm border-b border-border/50">
      <span className="text-muted-foreground tabular-nums">{formatDateShort(transaction.date)}</span>
      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 font-medium w-fit ${typeColor}`}>
        {(transaction.type ?? "other").toUpperCase()}
      </Badge>
      <span className="truncate">
        {transaction.securityName ?? "Unknown"}{" "}
        {transaction.ticker && <span className="text-muted-foreground">({transaction.ticker})</span>}
      </span>
      <span className="tabular-nums text-right text-muted-foreground">
        {transaction.quantity != null && transaction.price != null
          ? `${transaction.quantity} × ${centsToDisplay(transaction.price)}`
          : "—"}
      </span>
      <span className={`tabular-nums text-right font-medium ${transaction.amount < 0 ? "text-green-600" : ""}`}>
        {centsToDisplay(transaction.amount)}
      </span>
    </div>
  );
}
