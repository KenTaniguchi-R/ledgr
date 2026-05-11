import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import { createTestDb } from "./setup";
import { insertHousehold } from "./helpers";
import type { LedgrDb } from "../../src/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../src/lib/demo-mode", () => ({ guardDemoMode: vi.fn(() => null) }));

const mockUserId = "test-user-id";
let mockHouseholdId: string;
vi.mock("../../src/lib/auth/session", () => ({
  getHouseholdId: vi.fn(() => Promise.resolve(mockHouseholdId)),
  getSession: vi.fn(() => Promise.resolve({ user: { id: mockUserId } })),
}));

describe("report actions", () => {
  let db: LedgrDb;
  let close: () => void;

  beforeAll(() => {
    const testDb = createTestDb();
    db = testDb.db;
    close = testDb.close;

    const hh = insertHousehold(db);
    mockHouseholdId = hh.householdId;
  });

  afterAll(() => close());

  describe("saveReport", () => {
    test("persists report and returns id", async () => {
      const { saveReport } = await import("../../src/actions/reports");
      const result = await saveReport(
        { name: "Monthly Spending", reportType: "spending", filters: { dateFrom: "2026-01-01", dateTo: "2026-03-31" } },
        db,
      );
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("id");
    });
  });

  describe("deleteReport", () => {
    test("deletes owned report", async () => {
      const { saveReport, deleteReport } = await import("../../src/actions/reports");
      const saved = await saveReport(
        { name: "To Delete", reportType: "spending", filters: { dateFrom: "2026-01-01", dateTo: "2026-01-31" } },
        db,
      );
      if (!("id" in saved)) throw new Error("save failed");

      const result = await deleteReport(saved.id, db);
      expect(result).toEqual({ success: true });
    });

    test("rejects deletion of another household's report", async () => {
      const { getSavedReportsByHousehold } = await import("../../src/queries/saved-reports");
      const { deleteReport } = await import("../../src/actions/reports");

      const { householdId: otherHhId } = insertHousehold(db, "Other Household");
      const { savedReports } = await import("../../src/db/schema");
      const { v4: uuid } = await import("uuid");
      const id = uuid();
      db.insert(savedReports).values({
        id,
        householdId: otherHhId,
        name: "Other Report",
        reportType: "spending",
        filters: JSON.stringify({ dateFrom: "2026-01-01", dateTo: "2026-01-31" }),
      }).run();

      const result = await deleteReport(id, db);
      expect(result).toHaveProperty("error");

      const otherReports = getSavedReportsByHousehold(otherHhId, db);
      expect(otherReports).toHaveLength(1);
    });
  });

  describe("getSavedReportsByHousehold", () => {
    test("scoped to household", async () => {
      const { getSavedReportsByHousehold } = await import("../../src/queries/saved-reports");
      const reports = getSavedReportsByHousehold(mockHouseholdId, db);
      for (const report of reports) {
        expect(report.householdId).toBe(mockHouseholdId);
      }
    });
  });
});
