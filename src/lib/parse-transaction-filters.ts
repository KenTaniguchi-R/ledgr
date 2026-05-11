import type { TransactionFilters } from "@/queries/transactions";

export function parseTransactionFilters(
  params: Record<string, string | string[] | undefined>,
): { filters: TransactionFilters; isReviewMode: boolean } {
  const isReviewMode = params.mode === "review";

  const rawAmountMin = typeof params.amountMin === "string" ? parseInt(params.amountMin, 10) : undefined;
  const amountMin = rawAmountMin !== undefined && Number.isInteger(rawAmountMin) && rawAmountMin >= 0 ? rawAmountMin : undefined;

  const rawAmountMax = typeof params.amountMax === "string" ? parseInt(params.amountMax, 10) : undefined;
  const amountMax = rawAmountMax !== undefined && Number.isInteger(rawAmountMax) && rawAmountMax >= 0 ? rawAmountMax : undefined;

  const rawType = typeof params.type === "string" ? params.type : undefined;
  const transactionType = rawType === "expense" || rawType === "credits" || rawType === "transfer"
    ? rawType
    : undefined;

  const filters: TransactionFilters = {
    accountId: typeof params.account === "string" ? params.account : undefined,
    categoryId:
      params.category === "uncategorized"
        ? null
        : typeof params.category === "string"
          ? params.category
          : undefined,
    dateFrom: typeof params.from === "string" ? params.from : undefined,
    dateTo: typeof params.to === "string" ? params.to : undefined,
    search: typeof params.q === "string" ? params.q : undefined,
    reviewed: isReviewMode ? false : (params.reviewed === "true" ? true : undefined),
    amountMin,
    amountMax,
    transactionType,
  };

  return { filters, isReviewMode };
}
