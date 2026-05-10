"use client";

import { Button } from "@/components/ui/button";
import { AccountTypeIcon } from "@/components/atoms/account-type-icon";
import { BalanceDisplay } from "@/components/atoms/balance-display";
import { Pencil } from "lucide-react";
import type { AccountRow } from "@/queries/accounts";

interface AccountCardProps {
  account: AccountRow;
  onEdit: (account: AccountRow) => void;
}

export function AccountCard({ account, onEdit }: AccountCardProps) {
  const mask = account.plaidAccountId
    ? `···${account.plaidAccountId.slice(-4)}`
    : null;

  return (
    <div className="group/card flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <AccountTypeIcon type={account.type as Parameters<typeof AccountTypeIcon>[0]["type"]} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{account.name}</span>
            {mask && (
              <span className="text-xs text-muted-foreground">{mask}</span>
            )}
          </div>
          {account.officialName && account.officialName !== account.name && (
            <p className="text-xs text-muted-foreground truncate">
              {account.officialName}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <BalanceDisplay amount={account.currentBalance} size="sm" />
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 transition-opacity h-7 w-7 p-0"
          onClick={() => onEdit(account)}
          aria-label={`Edit ${account.name}`}
        >
          <Pencil className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
