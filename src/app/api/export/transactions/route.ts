import { NextRequest } from "next/server";
import { getHouseholdId } from "@/lib/auth/session";
import { baseTransactionQuery } from "@/queries/transactions";
import { transactions } from "@/db/schema";
import { notDeleted } from "@/lib/query-helpers";
import { desc, gte, lte, eq, like, isNull, type SQL } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { todayDateString } from "@/lib/date-utils";

interface ExportFilters {
  from?: string;
  to?: string;
  account?: string;
  category?: string;
  q?: string;
  reviewed?: string;
}

export async function buildCsvString(
  householdId: string,
  filters: ExportFilters,
  db: LedgrDb = defaultDb,
): Promise<string> {
  const conditions: (SQL | undefined)[] = [notDeleted(transactions)];

  if (filters.from) conditions.push(gte(transactions.date, filters.from));
  if (filters.to) conditions.push(lte(transactions.date, filters.to));
  if (filters.account) conditions.push(eq(transactions.accountId, filters.account));
  if (filters.category) {
    if (filters.category === "uncategorized") {
      conditions.push(isNull(transactions.categoryId));
    } else {
      conditions.push(eq(transactions.categoryId, filters.category));
    }
  }
  if (filters.q) conditions.push(like(transactions.name, `%${filters.q}%`));
  if (filters.reviewed === "true") conditions.push(eq(transactions.reviewed, true));

  const base = baseTransactionQuery(db, householdId);
  const rows = await base
    .joins(db.select(base.select).from(base.from))
    .where(base.scoped.where(transactions, ...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id));

  const header = "Date,Account,Merchant,Amount,Category,Category Group,Notes,Original Description";
  const dataRows = rows.map((row: (typeof rows)[0]) => {
    const amount = ((row.normalizedAmount ?? 0) / 100).toFixed(2);
    return [
      row.date,
      csvEscape(row.accountName ?? ""),
      csvEscape(row.merchantName ?? row.name ?? ""),
      amount,
      csvEscape(row.categoryName ?? ""),
      csvEscape(row.categoryGroupName ?? ""),
      csvEscape(row.notes ?? ""),
      csvEscape(row.originalName ?? ""),
    ].join(",");
  });

  return [header, ...dataRows].join("\n") + "\n";
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function buildCsvResponse(
  householdId: string,
  filters: ExportFilters,
  db: LedgrDb = defaultDb,
): Promise<Response> {
  const csv = await buildCsvString(householdId, filters, db);
  const encoder = new TextEncoder();
  const csvBytes = encoder.encode(csv);
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const body = new Uint8Array(bom.length + csvBytes.length);
  body.set(bom, 0);
  body.set(csvBytes, bom.length);
  const filename = `ledgr-transactions-${todayDateString()}.csv`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: NextRequest) {
  const householdId = await getHouseholdId();
  const sp = request.nextUrl.searchParams;

  const filters: ExportFilters = {
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
    account: sp.get("account") ?? undefined,
    category: sp.get("category") ?? undefined,
    q: sp.get("q") ?? undefined,
    reviewed: sp.get("reviewed") ?? undefined,
  };

  return buildCsvResponse(householdId, filters);
}
