"use client";

import { EntityAvatar } from "@/components/molecules/entity-avatar";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { formatDateShort } from "@/lib/date-utils";
import type { TransactionRow } from "@/queries/transactions";

interface TransferReviewCardProps {
  transaction: TransactionRow;
  direction: "forward" | "back";
}

export function TransferReviewCard({ transaction, direction }: TransferReviewCardProps) {
  const isIncome = transaction.normalizedAmount > 0;

  return (
    <div
      key={transaction.id}
      tabIndex={-1}
      className="outline-none space-y-4"
      data-direction={direction}
      style={{
        animation: `slide-in-${direction === "forward" ? "right" : "left"} 150ms ease-out`,
      }}
    >
      <div className="flex items-center gap-3">
        <EntityAvatar
          logoUrl={transaction.merchantLogoUrl}
          name={transaction.merchantName ?? transaction.name}
          pfcPrimary={transaction.pfcPrimary}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{transaction.name}</p>
          <p className="text-xs text-muted-foreground">
            {transaction.accountName} &middot; {formatDateShort(transaction.date)}
          </p>
        </div>
      </div>

      <div className="text-center py-2">
        <div className="text-3xl font-semibold tabular-nums">
          <AmountDisplay amount={transaction.normalizedAmount} currency={transaction.currency} />
        </div>
      </div>

      <p className="text-sm text-muted-foreground text-center text-balance">
        {isIncome
          ? "This looks like it could be money moving in from another account rather than income — is it a transfer?"
          : "This looks like it could be money moving to another account rather than a purchase — is it a transfer?"}
      </p>
    </div>
  );
}
