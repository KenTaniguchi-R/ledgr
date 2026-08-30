"use client";

import Link from "next/link";
import { accountDisplayName } from "@/lib/account-name";
import { EntityAvatar } from "@/components/molecules/entity-avatar";
import { BalanceDisplay } from "@/components/atoms/balance-display";
import type { AccountType } from "@/db/schema/accounts";

interface AccountBalanceRow {
  id: string;
  name: string;
  type: AccountType;
  currentBalance: number | null;
  currency: string | null;
  institutionName: string;
  logoBase64: string | null;
  primaryColor: string | null;
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
      {/* Account and balance are a real two-column table. The widget shows no
          visible headers, so they are screen-reader only -- without them the
          balances read as an undifferentiated run of numbers. */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <caption className="sr-only">Account balances</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.map((account) => (
              <tr key={account.id}>
                <td className="px-1 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <EntityAvatar
                      logoBase64={account.logoBase64}
                      name={account.institutionName}
                      primaryColor={account.primaryColor}
                      size="sm"
                    />
                    <span className="truncate text-sm">{accountDisplayName(account.name)}</span>
                  </div>
                </td>
                <td className="px-1 py-1.5 text-right">
                  <BalanceDisplay
                    amount={account.currentBalance}
                    currency={account.currency ?? "USD"}
                    size="sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
