import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { resolveHouseholdId } from "@/lib/auth/session";
import { scopedQuery } from "@/lib/scoped-query";
import { db } from "@/db";
import { transactions, accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { parsePreview, parseAll } from "@/lib/import/csv";
import { parseOfx } from "@/lib/import/ofx";
import { autoDetectMapping, validateMapping } from "@/lib/import/mapper";
import {
  normalizeImportedRows,
  type AmountConvention,
  type NormalizedRow,
} from "@/lib/import/normalize";
import { findDuplicates } from "@/lib/import/dedup";
import { normalizeAmount } from "@/lib/money";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const householdId = resolveHouseholdId(session.user.id);
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const step = formData.get("step") as string;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File must be under 10MB" },
      { status: 400 }
    );
  }

  const content = await file.text();
  const ext = file.name.split(".").pop()?.toLowerCase();
  const isOfx = ext === "ofx" || ext === "qfx";

  if (step === "preview") {
    if (isOfx) {
      const ofxTransactions = parseOfx(content);
      return NextResponse.json({
        type: "ofx",
        headers: ["Date", "Amount", "Description", "Type", "FIT ID"],
        rows: ofxTransactions.slice(0, 10).map((t) => ({
          Date: t.date,
          Amount: String(t.amount / 100),
          Description: t.description,
          Type: t.type,
          "FIT ID": t.fitId,
        })),
        totalRows: ofxTransactions.length,
        suggestedMapping: null,
      });
    }

    const preview = parsePreview(content);
    const suggestedMapping = autoDetectMapping(preview.headers);
    return NextResponse.json({
      type: "csv",
      ...preview,
      suggestedMapping,
    });
  }

  if (step === "import") {
    const accountId = formData.get("accountId") as string;
    const skipDuplicates = formData.get("skipDuplicates") === "true";

    if (!accountId) {
      return NextResponse.json(
        { error: "Account is required" },
        { status: 400 }
      );
    }

    const scoped = scopedQuery(householdId);
    const account = db
      .select({ id: accounts.id, type: accounts.type })
      .from(accounts)
      .where(scoped.where(accounts, eq(accounts.id, accountId)))
      .get();

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 403 }
      );
    }

    let normalized: NormalizedRow[];

    if (isOfx) {
      const ofxTransactions = parseOfx(content);
      normalized = ofxTransactions.map((t) => ({
        id: uuid(),
        accountId,
        householdId,
        date: t.date,
        originalName: t.description,
        name: t.description,
        amount: t.amount,
        externalId: t.fitId,
      }));
    } else {
      const mappingJson = formData.get("mapping") as string;
      const convention =
        (formData.get("convention") as AmountConvention) ||
        "positive_is_expense";

      if (!mappingJson) {
        return NextResponse.json(
          { error: "Column mapping is required" },
          { status: 400 }
        );
      }

      const mapping = JSON.parse(mappingJson);
      const validated = validateMapping(mapping);
      if (!validated.valid) {
        return NextResponse.json(
          { error: validated.errors.join(", ") },
          { status: 400 }
        );
      }

      const rows = parseAll(content);
      normalized = normalizeImportedRows(
        rows,
        validated.mapping,
        accountId,
        householdId,
        convention
      );
    }

    const { unique, duplicates } = findDuplicates(normalized, accountId, db);

    if (duplicates.length > 0 && !skipDuplicates) {
      return NextResponse.json({
        status: "duplicates_found",
        duplicateCount: duplicates.length,
        uniqueCount: unique.length,
        totalCount: normalized.length,
      });
    }

    const toInsert = skipDuplicates ? unique : normalized;

    if (toInsert.length === 0) {
      return NextResponse.json({ imported: 0, skipped: normalized.length });
    }

    db.transaction((tx) => {
      for (const row of toInsert) {
        tx.insert(transactions)
          .values({
            id: row.id,
            accountId: row.accountId,
            householdId: row.householdId,
            date: row.date,
            originalName: row.originalName,
            name: row.name,
            amount: row.amount,
            normalizedAmount: normalizeAmount(row.amount, account.type),
            externalId: row.externalId,
          })
          .run();
      }
    });

    return NextResponse.json({
      imported: toInsert.length,
      skipped: duplicates.length,
    });
  }

  return NextResponse.json({ error: "Invalid step" }, { status: 400 });
}
