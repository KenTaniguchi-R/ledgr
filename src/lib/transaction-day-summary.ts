/**
 * Per-day totals for the transaction list's date headers.
 *
 * Transfers are left out of the net for the same reason Reports, Budgets and
 * the dashboard leave them out: moving money between your own accounts is not
 * spending. The date header was the last total in the app that still counted
 * them, so after #159 tagged investment activity as a transfer, a day holding a
 * $1,000 brokerage buy still read as $1,000 gone while every other figure on
 * the site disagreed.
 */

export interface DayRow {
  isTransfer: boolean | null;
  normalizedAmount: number;
}

export interface DaySummary {
  spendingCount: number;
  transferCount: number;
  net: number;
}

export function summarizeDay(rows: DayRow[]): DaySummary {
  let spendingCount = 0;
  let transferCount = 0;
  let net = 0;

  for (const row of rows) {
    if (row.isTransfer) {
      transferCount += 1;
      continue;
    }
    spendingCount += 1;
    net += row.normalizedAmount;
  }

  return { spendingCount, transferCount, net };
}

/**
 * "4 transactions" while a day is all spending; the two counts are named apart
 * once a transfer is present. Without the split the count and the net beside it
 * describe different sets of rows with nothing on screen saying so.
 */
export function dayCountLabel({ spendingCount, transferCount }: DaySummary): string {
  if (transferCount === 0) {
    return `${spendingCount} ${plural(spendingCount, "transaction")}`;
  }
  if (spendingCount === 0) {
    return `${transferCount} ${plural(transferCount, "transfer")}`;
  }
  return `${spendingCount} spending · ${transferCount} ${plural(transferCount, "transfer")}`;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
