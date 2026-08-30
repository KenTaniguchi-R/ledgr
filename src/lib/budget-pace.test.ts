import { describe, it, expect } from "vitest";
import { budgetPace } from "./budget-pace";

describe("budgetPace", () => {
  const asOf = new Date("2026-08-21T12:00:00Z");

  it("reports what is left, not just what was spent", () => {
    expect(budgetPace({ totalBudgeted: 930000, totalSpent: 539387, month: "2026-08", asOf })).toEqual({
      budgeted: 930000,
      spent: 539387,
      remaining: 390613,
      pctUsed: 58,
      daysElapsed: 21,
      daysInMonth: 31,
      exceeded: false,
    });
  });

  describe("returns null rather than inventing a budget", () => {
    // The tile falls back to the plain spend figure plus a "Set a budget" link.
    // Guessing a budget from past spending would be the app deciding what the
    // household should spend, which is not its call.
    it("when no budget is configured", () => {
      expect(budgetPace({ totalBudgeted: 0, totalSpent: 539387, month: "2026-08", asOf })).toBeNull();
    });

    it("when the budget total is negative", () => {
      expect(budgetPace({ totalBudgeted: -100, totalSpent: 0, month: "2026-08", asOf })).toBeNull();
    });
  });

  describe("exceeded", () => {
    it("is false at exactly the budget", () => {
      // Spending the whole budget is not an overrun.
      const pace = budgetPace({ totalBudgeted: 100000, totalSpent: 100000, month: "2026-08", asOf })!;
      expect(pace.exceeded).toBe(false);
      expect(pace.remaining).toBe(0);
    });

    it("is true one cent over", () => {
      const pace = budgetPace({ totalBudgeted: 100000, totalSpent: 100001, month: "2026-08", asOf })!;
      expect(pace.exceeded).toBe(true);
      expect(pace.remaining).toBe(-1);
    });
  });

  describe("days elapsed", () => {
    it("counts the current day within the reported month", () => {
      const pace = budgetPace({ totalBudgeted: 1, totalSpent: 0, month: "2026-08", asOf })!;
      expect(pace).toMatchObject({ daysElapsed: 21, daysInMonth: 31 });
    });

    it("reports a past month as fully elapsed", () => {
      // Looking at July in August: the month is over, so 31 of 31 — not the
      // 21 days that have passed in the current month.
      const pace = budgetPace({ totalBudgeted: 1, totalSpent: 0, month: "2026-07", asOf })!;
      expect(pace).toMatchObject({ daysElapsed: 31, daysInMonth: 31 });
    });

    it("reports a future month as not started", () => {
      const pace = budgetPace({ totalBudgeted: 1, totalSpent: 0, month: "2026-09", asOf })!;
      expect(pace).toMatchObject({ daysElapsed: 0, daysInMonth: 30 });
    });

    describe("across a year boundary", () => {
      // The month index alone is not enough: December is index 11 and August is
      // 7, so a naive `monthIndex > current` reads last December as a month
      // that has not started yet and reports "0 of 31 days" for a month that
      // is over. A returning user whose latest activity was last December hits
      // exactly this.
      it("reports last December as fully elapsed, not as not-yet-started", () => {
        const pace = budgetPace({ totalBudgeted: 1, totalSpent: 0, month: "2025-12", asOf })!;
        expect(pace).toMatchObject({ daysElapsed: 31, daysInMonth: 31 });
      });

      it("reports next January as not started, not as fully elapsed", () => {
        const pace = budgetPace({ totalBudgeted: 1, totalSpent: 0, month: "2027-01", asOf })!;
        expect(pace).toMatchObject({ daysElapsed: 0, daysInMonth: 31 });
      });

      it("reports a month years back as fully elapsed", () => {
        const pace = budgetPace({ totalBudgeted: 1, totalSpent: 0, month: "2019-06", asOf })!;
        expect(pace).toMatchObject({ daysElapsed: 30, daysInMonth: 30 });
      });
    });

    it("knows February in a leap year", () => {
      const pace = budgetPace({
        totalBudgeted: 1,
        totalSpent: 0,
        month: "2028-02",
        asOf: new Date("2028-02-10T12:00:00Z"),
      })!;
      expect(pace).toMatchObject({ daysElapsed: 10, daysInMonth: 29 });
    });

    it("knows February in a non-leap year", () => {
      const pace = budgetPace({
        totalBudgeted: 1,
        totalSpent: 0,
        month: "2026-02",
        asOf: new Date("2026-02-10T12:00:00Z"),
      })!;
      expect(pace).toMatchObject({ daysElapsed: 10, daysInMonth: 28 });
    });
  });

  describe("pctUsed", () => {
    it("rounds to a whole percent", () => {
      expect(budgetPace({ totalBudgeted: 300, totalSpent: 100, month: "2026-08", asOf })!.pctUsed).toBe(33);
    });

    it("can exceed 100 rather than clamping", () => {
      // The rail clamps its width; the number should still tell the truth.
      expect(budgetPace({ totalBudgeted: 100, totalSpent: 250, month: "2026-08", asOf })!.pctUsed).toBe(250);
    });

    it("is 0 when nothing has been spent", () => {
      expect(budgetPace({ totalBudgeted: 100000, totalSpent: 0, month: "2026-08", asOf })!.pctUsed).toBe(0);
    });
  });

  it("does not judge pace", () => {
    // Deliberately absent: any "on pace" / "over pace" flag. A household paying
    // rent on the 1st is "over pace" every month of its life, and a ledger
    // records what happened rather than grading it. Callers get the arithmetic
    // — spent, budgeted, days elapsed — and draw their own conclusion.
    const pace = budgetPace({ totalBudgeted: 100000, totalSpent: 99000, month: "2026-08", asOf })!;
    expect(Object.keys(pace).sort()).toEqual([
      "budgeted",
      "daysElapsed",
      "daysInMonth",
      "exceeded",
      "pctUsed",
      "remaining",
      "spent",
    ]);
  });
});
