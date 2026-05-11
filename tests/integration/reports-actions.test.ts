import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../integration/setup";
import { v4 as uuid } from "uuid";
import { savedReports, households } from "@/db/schema";
import type { LedgrDb } from "@/db";
import { eq } from "drizzle-orm";
import { scopedQuery } from "@/lib/scoped-query";

async function deleteReportScoped(reportId: string, householdId: string, db: LedgrDb) {
  const scoped = scopedQuery(householdId, db);
  const result = await db
    .delete(savedReports)
    .where(scoped.where(savedReports, eq(savedReports.id, reportId)));
  return result.rowCount ?? 0;
}

describe("deleteReport scoping", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    const now = new Date();
    await db.insert(households).values([
      { id: "h1", name: "House 1", createdAt: now, updatedAt: now },
      { id: "h2", name: "House 2", createdAt: now, updatedAt: now },
    ]);
  });

  afterEach(async () => {
    await close();
  });

  it("cannot delete a report belonging to another household", async () => {
    const now = new Date();
    const reportId = uuid();
    await db.insert(savedReports).values({
      id: reportId,
      householdId: "h1",
      name: "My Report",
      reportType: "spending",
      filters: "{}",
      createdAt: now,
      updatedAt: now,
    });

    const changes = await deleteReportScoped(reportId, "h2", db);
    expect(changes).toBe(0);

    const [remaining] = await db.select().from(savedReports).where(eq(savedReports.id, reportId));
    expect(remaining).toBeDefined();
  });

  it("can delete own report", async () => {
    const now = new Date();
    const reportId = uuid();
    await db.insert(savedReports).values({
      id: reportId,
      householdId: "h1",
      name: "My Report",
      reportType: "spending",
      filters: "{}",
      createdAt: now,
      updatedAt: now,
    });

    const changes = await deleteReportScoped(reportId, "h1", db);
    expect(changes).toBe(1);
  });
});
