import { createHash } from "node:crypto";
import { eq, and, inArray } from "drizzle-orm";
import { db as defaultDb, type LedgrDb } from "@/db";
import { transactions } from "@/db/schema";
import type { NormalizedRow } from "./normalize";

export function generateDedupHash(row: { date: string; amount: number; description: string }): string {
  const input = `${row.date}|${row.amount}|${row.description.toLowerCase().trim()}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export interface DedupResult {
  unique: NormalizedRow[];
  duplicates: NormalizedRow[];
}

export function findDuplicates(
  rows: NormalizedRow[],
  accountId: string,
  db: LedgrDb = defaultDb,
): DedupResult {
  if (rows.length === 0) return { unique: [], duplicates: [] };

  const withExternalId = rows.filter((r) => r.externalId);
  const withoutExternalId = rows.filter((r) => !r.externalId);

  const duplicates: NormalizedRow[] = [];
  const unique: NormalizedRow[] = [];

  if (withExternalId.length > 0) {
    const existingExternal = db
      .select({ externalId: transactions.externalId })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          inArray(transactions.externalId, withExternalId.map((r) => r.externalId!)),
        ),
      )
      .all();
    const existingIds = new Set(existingExternal.map((e) => e.externalId));

    for (const row of withExternalId) {
      if (existingIds.has(row.externalId)) {
        duplicates.push(row);
      } else {
        unique.push(row);
      }
    }
  }

  if (withoutExternalId.length > 0) {
    const existing = db
      .select({
        date: transactions.date,
        amount: transactions.amount,
        originalName: transactions.originalName,
      })
      .from(transactions)
      .where(eq(transactions.accountId, accountId))
      .all();

    const existingHashes = new Set(
      existing.map((t) => generateDedupHash({
        date: t.date,
        amount: t.amount,
        description: t.originalName,
      })),
    );

    for (const row of withoutExternalId) {
      const hash = generateDedupHash({
        date: row.date,
        amount: row.amount,
        description: row.originalName,
      });
      if (existingHashes.has(hash)) {
        duplicates.push(row);
      } else {
        unique.push(row);
      }
    }
  }

  return { unique, duplicates };
}
