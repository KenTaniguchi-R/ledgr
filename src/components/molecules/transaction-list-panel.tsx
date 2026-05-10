"use client";

import { useMemo } from "react";
import { groupByDate } from "@/lib/transactions";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/atoms/entity-avatar";
import { formatDateShort } from "@/lib/date-utils";
import type { TransactionRow } from "@/queries/transactions";

interface TransactionListPanelProps {
  rows: TransactionRow[];
}

export function TransactionListPanel({ rows }: TransactionListPanelProps) {
  const groups = useMemo(() => groupByDate(rows), [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        No transactions found.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map((group) => (
        <div key={group.date}>
          <div className="text-xs font-medium text-muted-foreground px-1 py-1.5 sticky top-0 bg-background">
            {formatDateShort(group.date)}
          </div>
          {group.rows.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center gap-2 py-1.5 px-1 text-sm hover:bg-muted/50 rounded"
            >
              <EntityAvatar
                logoUrl={txn.merchantLogoUrl}
                name={txn.merchantName ?? txn.name}
                pfcPrimary={txn.pfcPrimary}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{txn.name}</div>
                <div className="text-xs text-muted-foreground truncate">{txn.accountName}</div>
              </div>
              <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} pending={txn.pending} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
