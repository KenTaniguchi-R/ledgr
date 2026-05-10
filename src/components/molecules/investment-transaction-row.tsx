import { centsToDisplay } from "@/lib/money";
import { TransactionTypeBadge } from "@/components/atoms/transaction-type-badge";
import { formatDateShort } from "@/lib/date-utils";
import type { InvTxnRow } from "@/queries/investments";

interface InvestmentTransactionRowProps {
  transaction: InvTxnRow;
}

export function InvestmentTransactionRow({ transaction }: InvestmentTransactionRowProps) {
  return (
    <div className="grid grid-cols-[90px_70px_2fr_100px_100px] gap-2 items-center h-10 px-3 text-sm border-b border-border/50">
      <span className="text-muted-foreground tabular-nums">{formatDateShort(transaction.date)}</span>
      <TransactionTypeBadge type={transaction.type} />
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
