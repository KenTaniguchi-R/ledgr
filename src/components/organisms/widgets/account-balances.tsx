"use client";

import Link from "next/link";
import { accountDisplayName } from "@/lib/account-name";
import { groupAccountsByType } from "@/lib/group-accounts-by-type";
import { EntityAvatar } from "@/components/molecules/entity-avatar";
import { BalanceDisplay } from "@/components/atoms/balance-display";
import type { AccountType } from "@/db/schema/accounts";

interface AccountBalanceRow {
  id: string;
  name: string;
  type: AccountType;
  currentBalance: number | null;
  currency: string | null;
  isHidden: boolean | null;
  institutionName: string;
  logoBase64: string | null;
  primaryColor: string | null;
}

interface AccountBalancesWidgetProps {
  data: AccountBalanceRow[];
}

export function AccountBalancesWidget({ data }: AccountBalancesWidgetProps) {
  // The same grouping and the same subtotal component the Accounts page uses
  // (organisms/account-list.tsx), so the widget and the page it links to name,
  // order and total their sections identically. Flat, every balance read as the
  // same kind of number: an $18,240 savings balance and a -$8,400 loan sat in
  // one undifferentiated run with nothing marking which side each was on.
  const groups = groupAccountsByType(data);

  if (groups.length === 0) {
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Deliberately not ui/table: shadcn's <Table> wraps itself in an
            `overflow-x-auto` container, which is the horizontal scrollbar #159
            removed from this widget. table-fixed plus a pinned balance column
            is what keeps a long balance from pushing past the card's edge, and
            the clipping parent above is what absorbs it when one still does.
            Group headers are ordinary rows of this same table for that reason. */}
        <table className="w-full table-fixed">
          <caption className="sr-only">Account balances by type</caption>
          <colgroup>
            <col />
            <col className="w-24" />
          </colgroup>
          <thead className="sr-only">
            <tr>
              <th scope="col">Account</th>
              <th scope="col">Balance</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.key}>
              <tr className="bg-muted/50">
                <th
                  scope="rowgroup"
                  className="px-1.5 py-1 text-left text-xs font-semibold"
                >
                  {group.label}
                </th>
                <td className="px-1.5 py-1 text-right whitespace-nowrap">
                  <BalanceDisplay
                    amount={group.subtotal}
                    currency={group.accounts[0]?.currency ?? "USD"}
                    size="sm"
                    className="text-xs font-semibold"
                  />
                </td>
              </tr>
              {group.accounts.map((account) => (
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
                  <td className="px-1 py-1.5 text-right whitespace-nowrap">
                    <BalanceDisplay
                      amount={account.currentBalance}
                      currency={account.currency ?? "USD"}
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
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
