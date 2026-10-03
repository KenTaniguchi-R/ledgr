import { todayDateString } from "@/lib/date-utils";
import type { ReportFilters } from "@/queries/reports";

const ALLOWED_PARAMS = new Set([
  "dateFrom",
  "dateTo",
  "accountId",
  "categoryId",
]);
const DEFAULT_LOOKBACK_DAYS = 90;
const MAX_IDENTIFIER_LENGTH = 255;

export type ToolSpendingSummaryParseResult =
  | { success: true; data: ReportFilters }
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

function invalid(message: string): ToolSpendingSummaryParseResult {
  return { success: false, message };
}

export function parseToolSpendingSummaryParams(
  params: URLSearchParams,
): ToolSpendingSummaryParseResult {
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
  if ((dateFromParam === null) !== (dateToParam === null)) {
    return invalid("dateFrom and dateTo must be supplied together");
  }
  if (dateFromParam !== null && !isCalendarDate(dateFromParam)) {
    return invalid("dateFrom must be a real date in YYYY-MM-DD format");
  }
  if (dateToParam !== null && !isCalendarDate(dateToParam)) {
    return invalid("dateTo must be a real date in YYYY-MM-DD format");
  }

  const dateTo = dateToParam ?? todayDateString();
  const dateFrom = dateFromParam ?? dateDaysBefore(dateTo, DEFAULT_LOOKBACK_DAYS);
  if (dateFrom > dateTo) {
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

  return {
    success: true,
    data: {
      dateFrom,
      dateTo,
      accountIds: accountId === null ? undefined : [accountId],
      categoryIds: categoryId === null ? undefined : [categoryId],
    },
  };
}
