import { v4 as uuid } from "uuid";
import type { ValidatedMapping } from "./mapper";
import { parseToCents } from "@/lib/money";
import { cleanTransactionName } from "./clean-name";

export type AmountConvention = "positive_is_expense" | "positive_is_income";

export interface NormalizedRow {
  id: string;
  accountId: string;
  householdId: string;
  date: string;
  originalName: string;
  name: string;
  amount: number;
  externalId: string | null;
}

function parseDateToISO(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const mdyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return dateStr;
}

export interface SkippedRow {
  row: Record<string, string>;
  reason: string;
}

export interface NormalizeResult {
  rows: NormalizedRow[];
  skipped: SkippedRow[];
}

export function normalizeImportedRows(
  rows: Record<string, string>[],
  mapping: ValidatedMapping,
  accountId: string,
  householdId: string,
  convention: AmountConvention,
): NormalizeResult {
  const result: NormalizedRow[] = [];
  const skipped: SkippedRow[] = [];

  for (const row of rows) {
    const dateStr = row[mapping.date] ?? "";
    const description = row[mapping.description] ?? "";
    if (!dateStr || !description) continue;

    let amountCents: number;

    if (mapping.amount) {
      const parsed = parseToCents(row[mapping.amount] ?? "0");
      if (parsed === null) {
        skipped.push({ row, reason: `Unparseable amount: "${row[mapping.amount] ?? ""}"` });
        continue;
      }
      amountCents = convention === "positive_is_income" ? -parsed : parsed;
    } else {
      const debitStr = row[mapping.debit!] ?? "";
      const creditStr = row[mapping.credit!] ?? "";
      const debit = debitStr ? parseToCents(debitStr) : 0;
      const credit = creditStr ? parseToCents(creditStr) : 0;
      if (debit === null) {
        skipped.push({ row, reason: `Unparseable debit amount: "${debitStr}"` });
        continue;
      }
      if (credit === null) {
        skipped.push({ row, reason: `Unparseable credit amount: "${creditStr}"` });
        continue;
      }
      amountCents = debit > 0 ? debit : -credit;
    }

    result.push({
      id: uuid(),
      accountId,
      householdId,
      date: parseDateToISO(dateStr),
      originalName: description.trim(),
      name: cleanTransactionName(description),
      amount: amountCents,
      externalId: null,
    });
  }

  return { rows: result, skipped };
}
