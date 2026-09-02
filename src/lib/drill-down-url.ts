/**
 * Build the "View all in Transactions" link behind a report drill-down.
 *
 * `categoryId` follows the query-layer convention: a string is a real category,
 * `null` means "no category assigned", and `undefined` means "don't filter by
 * category at all". The transactions page has no null in a URL, so it encodes
 * the uncategorized case as the sentinel `category=uncategorized` (see
 * `parse-transaction-filters.ts`).
 */
export function drillDownTransactionsUrl(params: {
  categoryId?: string | null;
  month?: string;
  dateFrom: string;
  dateTo: string;
}): string {
  const { categoryId, month, dateFrom, dateTo } = params;

  const search = new URLSearchParams({
    ...(categoryId === undefined
      ? {}
      : { category: categoryId ?? "uncategorized" }),
    from: month ? `${month}-01` : dateFrom,
    to: month ? `${month}-31` : dateTo,
  });

  return `/transactions?${search.toString()}`;
}
