"use client";

import { useMemo } from "react";
import { groupByDate } from "@/lib/transactions";
import { AmountDisplay } from "@/components/atoms/amount-display";
import { EntityAvatar } from "@/components/molecules/entity-avatar";
import { formatDateShort } from "@/lib/date-utils";
import type { TransactionRow } from "@/queries/transactions";

interface TransactionListPanelProps {
  rows: TransactionRow[];
  absoluteAmounts?: boolean;
}

export function TransactionListPanel({ rows, absoluteAmounts = false }: TransactionListPanelProps) {
  const groups = useMemo(() => groupByDate(rows), [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
        No transactions found.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <div key={group.date}>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-2 sticky top-0 z-10 bg-background border-b border-border/50">
            {formatDateShort(group.date)}
          </div>
          {group.rows.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center gap-3 py-2.5 px-2 text-sm rounded-md hover:bg-muted transition-colors cursor-default"
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
              <AmountDisplay amount={txn.normalizedAmount} currency={txn.currency} pending={txn.pending} absolute={absoluteAmounts} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
