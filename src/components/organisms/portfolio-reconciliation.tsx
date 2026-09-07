import { centsToDisplay } from "@/lib/money";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      {/* Wide content scrolls inside Table's own container so the page never
          scrolls sideways on a phone. */}
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow className="text-xs uppercase tracking-wide text-muted-foreground hover:bg-transparent">
            <TableHead className="px-4 text-left font-medium">Account</TableHead>
            <TableHead className="px-4 text-right font-medium">Balance</TableHead>
            <TableHead className="px-4 text-right font-medium">Holdings</TableHead>
            <TableHead className="px-4 text-right font-medium">Cash / unallocated</TableHead>
          </TableRow>
        </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.accountId}>
                <TableCell className="px-4">
                  {row.accountName}
                  {/* A balance with no holdings at all is a connector that
                      itemized nothing, not a cash position -- worth saying so
                      rather than labelling the whole balance "cash". */}
                  {!row.hasHoldings && row.balance > 0 && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      not itemized
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-4 text-right tabular-nums">{centsToDisplay(row.balance)}</TableCell>
                <TableCell className="px-4 text-right tabular-nums">
                  {centsToDisplay(row.holdingsValue)}
                </TableCell>
                <TableCell className="px-4 text-right tabular-nums">
                  {row.cashValue > 0 ? (
                    centsToDisplay(row.cashValue)
                  ) : (
                    <span className="text-muted-foreground">&mdash;</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="px-4">Total</TableCell>
              <TableCell className="px-4 text-right tabular-nums">
                {centsToDisplay(totals.balance)}
              </TableCell>
              <TableCell className="px-4 text-right tabular-nums">
                {centsToDisplay(totals.holdingsValue)}
              </TableCell>
              <TableCell className="px-4 text-right tabular-nums">
                {centsToDisplay(totals.cashValue)}
              </TableCell>
            </TableRow>
          </TableFooter>
      </Table>
    </div>
  );
}
