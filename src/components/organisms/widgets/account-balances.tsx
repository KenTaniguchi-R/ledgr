"use client";

import Link from "next/link";
import { AccountTypeIcon } from "@/components/atoms/account-type-icon";
import { BalanceDisplay } from "@/components/atoms/balance-display";
import type { AccountType } from "@/db/schema/accounts";

interface AccountBalanceRow {
  id: string;
  name: string;
  type: AccountType;
  currentBalance: number | null;
  currency: string | null;
}

interface AccountBalancesWidgetProps {
  data: AccountBalanceRow[];
}

export function AccountBalancesWidget({ data }: AccountBalancesWidgetProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Link href="/accounts" className="text-primary hover:underline">Connect an account</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 space-y-1 overflow-y-auto">
        {data.map((account) => (
          <div key={account.id} className="flex items-center justify-between py-1.5 px-1">
            <div className="flex items-center gap-2 min-w-0">
              <AccountTypeIcon type={account.type} />
              <span className="text-sm truncate">{account.name}</span>
            </div>
            <BalanceDisplay amount={account.currentBalance} currency={account.currency ?? "USD"} size="sm" />
          </div>
        ))}
      </div>
      <Link
        href="/accounts"
        className="text-xs text-primary hover:underline text-center pt-2 mt-auto"
      >
        View all accounts
      </Link>
    </div>
  );
}
