import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../integration/setup";
import { v4 as uuid } from "uuid";
import { savedReports, households } from "@/db/schema";
import { nowISO } from "@/lib/date-utils";
import type { LedgrDb } from "@/db";
import { eq } from "drizzle-orm";
import { scopedQuery } from "@/lib/scoped-query";

function deleteReportScoped(reportId: string, householdId: string, db: LedgrDb) {
  const scoped = scopedQuery(householdId, db);
  const result = db
    .delete(savedReports)
    .where(scoped.where(savedReports, eq(savedReports.id, reportId)))
    .run();
  return result.changes;
}

describe("deleteReport scoping", () => {
  let db: LedgrDb;
  let close: () => void;

  beforeEach(() => {
    ({ db, close } = createTestDb());
    const now = nowISO();
    db.insert(households).values([
      { id: "h1", name: "House 1", createdAt: now, updatedAt: now },
      { id: "h2", name: "House 2", createdAt: now, updatedAt: now },
    ]).run();
  });

  afterEach(() => close());

  it("cannot delete a report belonging to another household", () => {
    const now = nowISO();
    const reportId = uuid();
    db.insert(savedReports).values({
      id: reportId,
      householdId: "h1",
      name: "My Report",
      reportType: "spending",
      filters: "{}",
      createdAt: now,
      updatedAt: now,
    }).run();

    const changes = deleteReportScoped(reportId, "h2", db);
    expect(changes).toBe(0);

    const remaining = db.select().from(savedReports).where(eq(savedReports.id, reportId)).get();
    expect(remaining).toBeDefined();
  });

  it("can delete own report", () => {
    const now = nowISO();
    const reportId = uuid();
    db.insert(savedReports).values({
      id: reportId,
      householdId: "h1",
      name: "My Report",
      reportType: "spending",
      filters: "{}",
      createdAt: now,
      updatedAt: now,
    }).run();

    const changes = deleteReportScoped(reportId, "h1", db);
    expect(changes).toBe(1);
  });
});
