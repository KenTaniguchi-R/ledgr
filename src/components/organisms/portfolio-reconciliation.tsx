import { centsToDisplay } from "@/lib/money";
import type { AccountReconciliationRow } from "@/queries/investments";

interface PortfolioReconciliationProps {
  rows: AccountReconciliationRow[];
}

/**
 * Balance-versus-holdings, per account.
 *
 * Investments used to report only the holdings sum, so an account reporting a
 * balance it had not itemized lost the difference with nothing on screen to
 * explain it (#88). This table is where that difference becomes visible.
 */
export function PortfolioReconciliation({ rows }: PortfolioReconciliationProps) {
  // Nothing to reconcile when every account's holdings account for its balance.
  if (rows.length === 0 || rows.every((r) => r.cashValue === 0)) return null;

  const totals = rows.reduce(
    (acc, r) => ({
      balance: acc.balance + r.balance,
      holdingsValue: acc.holdingsValue + r.holdingsValue,
      cashValue: acc.cashValue + r.cashValue,
    }),
    { balance: 0, holdingsValue: 0, cashValue: 0 },
  );

  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-medium">Account reconciliation</h3>
        <p className="text-xs text-muted-foreground">
          What each account reports, against the holdings Ledgr can itemize.
        </p>
      </div>
      {/* Wide content scrolls inside its own container so the page never
          scrolls sideways on a phone. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Account</th>
              <th className="px-4 py-2 text-right font-medium">Balance</th>
              <th className="px-4 py-2 text-right font-medium">Holdings</th>
              <th className="px-4 py-2 text-right font-medium">Cash / unallocated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.accountId} className="border-b last:border-b-0">
                <td className="px-4 py-2">
                  {row.accountName}
                  {/* A balance with no holdings at all is a connector that
                      itemized nothing, not a cash position -- worth saying so
                      rather than labelling the whole balance "cash". */}
                  {!row.hasHoldings && row.balance > 0 && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      not itemized
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{centsToDisplay(row.balance)}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {centsToDisplay(row.holdingsValue)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {row.cashValue > 0 ? (
                    centsToDisplay(row.cashValue)
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {centsToDisplay(totals.balance)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {centsToDisplay(totals.holdingsValue)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {centsToDisplay(totals.cashValue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
