"use client";

import Link from "next/link";
import { AmountDisplay } from "@/components/atoms/amount-display";
import type { TransactionRow } from "@/queries/transactions";

interface RecentTransactionsWidgetProps {
  data: TransactionRow[];
}

function formatDate(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentTransactionsWidget({ data }: RecentTransactionsWidgetProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No transactions yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-1">
        {data.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between py-1.5 px-1">
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{tx.merchantName ?? tx.name}</p>
              <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
            </div>
            <AmountDisplay amount={tx.normalizedAmount} currency={tx.currency} />
          </div>
        ))}
      </div>
      <Link
        href="/transactions"
        className="text-xs text-primary hover:underline text-center pt-2 mt-auto"
      >
        View all transactions
      </Link>
    </div>
  );
}
