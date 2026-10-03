import type { TransactionFilters } from "@/queries/transactions";
import { todayDateString } from "@/lib/date-utils";
import { decodeCursor } from "@/lib/query-helpers";

const ALLOWED_PARAMS = new Set([
  "dateFrom",
  "dateTo",
  "accountId",
  "categoryId",
  "limit",
  "cursor",
]);

export const DEFAULT_TOOL_TRANSACTION_LIMIT = 50;
export const MAX_TOOL_TRANSACTION_LIMIT = 100;
const DEFAULT_LOOKBACK_DAYS = 90;
const MAX_IDENTIFIER_LENGTH = 255;
const MAX_CURSOR_LENGTH = 1024;

export type ToolTransactionRequest = {
  filters: Pick<
    TransactionFilters,
    "dateFrom" | "dateTo" | "accountId" | "categoryId"
  >;
  limit: number;
  cursor: string | null;
};

export type ToolTransactionParseResult =
  | { success: true; data: ToolTransactionRequest }
  | { success: false; message: string };

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dateDaysBefore(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  date.setDate(date.getDate() - days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function isIdentifier(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH &&
    value === value.trim()
  );
}

function invalid(message: string): ToolTransactionParseResult {
  return { success: false, message };
}

export function parseToolTransactionParams(
  params: URLSearchParams,
): ToolTransactionParseResult {
  for (const key of params.keys()) {
    if (!ALLOWED_PARAMS.has(key)) {
      return invalid(`Unsupported query parameter: ${key}`);
    }
    if (params.getAll(key).length !== 1) {
      return invalid(`Query parameter must appear once: ${key}`);
    }
  }

  const dateFromParam = params.get("dateFrom");
  const dateToParam = params.get("dateTo");
  if (dateFromParam !== null && !isCalendarDate(dateFromParam)) {
    return invalid("dateFrom must be a real date in YYYY-MM-DD format");
  }
  if (dateToParam !== null && !isCalendarDate(dateToParam)) {
    return invalid("dateTo must be a real date in YYYY-MM-DD format");
  }

  let dateFrom = dateFromParam ?? undefined;
  let dateTo = dateToParam ?? undefined;
  if (dateFrom === undefined && dateTo === undefined) {
    dateTo = todayDateString();
    dateFrom = dateDaysBefore(dateTo, DEFAULT_LOOKBACK_DAYS);
  }
  if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
    return invalid("dateFrom must be on or before dateTo");
  }

  const accountId = params.get("accountId");
  if (accountId !== null && !isIdentifier(accountId)) {
    return invalid("accountId must be a non-empty identifier");
  }
  const categoryId = params.get("categoryId");
  if (categoryId !== null && !isIdentifier(categoryId)) {
    return invalid("categoryId must be a non-empty identifier");
  }

  const limitParam = params.get("limit");
  let limit = DEFAULT_TOOL_TRANSACTION_LIMIT;
  if (limitParam !== null) {
    if (!/^[1-9]\d*$/.test(limitParam)) {
      return invalid("limit must be a positive integer");
    }
    limit = Number(limitParam);
    if (!Number.isSafeInteger(limit) || limit > MAX_TOOL_TRANSACTION_LIMIT) {
      return invalid(`limit must not exceed ${MAX_TOOL_TRANSACTION_LIMIT}`);
    }
  }

  const cursor = params.get("cursor");
  if (cursor !== null) {
    const decoded = cursor.length <= MAX_CURSOR_LENGTH ? decodeCursor(cursor) : null;
    if (
      decoded === null ||
      !isCalendarDate(decoded.date) ||
      !isIdentifier(decoded.id)
    ) {
      return invalid("cursor is invalid");
    }
  }

  return {
    success: true,
    data: {
      filters: {
        dateFrom,
        dateTo,
        accountId: accountId ?? undefined,
        categoryId: categoryId ?? undefined,
      },
      limit,
      cursor,
    },
  };
}
