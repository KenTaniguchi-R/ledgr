import { describe, it, expect } from "vitest";
import { groupByDate } from "./transactions";

describe("groupByDate", () => {
  it("returns empty array for empty input", () => {
    expect(groupByDate([])).toEqual([]);
  });

  it("groups rows with the same date", () => {
    const rows = [
      { date: "2026-05-09", id: "a" },
      { date: "2026-05-09", id: "b" },
      { date: "2026-05-08", id: "c" },
    ];
    const groups = groupByDate(rows);
    expect(groups).toEqual([
      { date: "2026-05-09", rows: [{ date: "2026-05-09", id: "a" }, { date: "2026-05-09", id: "b" }] },
      { date: "2026-05-08", rows: [{ date: "2026-05-08", id: "c" }] },
    ]);
  });

  it("preserves insertion order across dates", () => {
    const rows = [
      { date: "2026-05-09", id: "1" },
      { date: "2026-05-08", id: "2" },
      { date: "2026-05-07", id: "3" },
    ];
    const groups = groupByDate(rows);
    expect(groups.map((g) => g.date)).toEqual(["2026-05-09", "2026-05-08", "2026-05-07"]);
  });

  it("merges rows from pagination boundary (same date split across pages)", () => {
    const page1 = [
      { date: "2026-05-09", id: "a" },
      { date: "2026-05-08", id: "b" },
    ];
    const page2 = [
      { date: "2026-05-08", id: "c" },
      { date: "2026-05-07", id: "d" },
    ];
    const allRows = [...page1, ...page2];
    const groups = groupByDate(allRows);
    expect(groups).toHaveLength(3);
    expect(groups[1]).toEqual({
      date: "2026-05-08",
      rows: [{ date: "2026-05-08", id: "b" }, { date: "2026-05-08", id: "c" }],
    });
  });

  it("handles single row", () => {
    const rows = [{ date: "2026-05-09", id: "a" }];
    const groups = groupByDate(rows);
    expect(groups).toEqual([{ date: "2026-05-09", rows: [{ date: "2026-05-09", id: "a" }] }]);
  });
});
