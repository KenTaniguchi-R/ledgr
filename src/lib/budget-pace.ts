/**
 * Turns a month's budget totals into what the dashboard's Spending tile needs.
 *
 * The tile used to report the month's spend and its change against last month,
 * which answers "how does this compare" — a question nobody asks. People ask
 * how much is left, and the budget tables already know.
 *
 * Deliberately absent: any judgement of pace. "On pace" encodes a linear-burn
 * model that is wrong for any month with rent, tuition or an annual renewal on
 * the first, and a household paying rent on the 1st would be "over pace" every
 * month of its life. Callers get the arithmetic — spent, budgeted, days
 * elapsed — and the reader draws the conclusion.
 */

export interface BudgetPaceInput {
  totalBudgeted: number;
  totalSpent: number;
  /** The month being reported, "YYYY-MM". */
  month: string;
  /** Injected so the day count is testable. */
  asOf: Date;
}

export interface BudgetPace {
  budgeted: number;
  spent: number;
  /** Negative once the budget is exceeded. */
  remaining: number;
  /** 0-100+, uncapped: the rail clamps its width, the number tells the truth. */
  pctUsed: number;
  daysElapsed: number;
  daysInMonth: number;
  exceeded: boolean;
}

function parseMonth(month: string): { year: number; monthIndex: number } {
  const [year, m] = month.split("-").map(Number);
  return { year, monthIndex: m - 1 };
}

/** Day 0 of the next month is the last day of this one, which handles leap years. */
function daysIn(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function budgetPace({
  totalBudgeted,
  totalSpent,
  month,
  asOf,
}: BudgetPaceInput): BudgetPace | null {
  // No budget configured. The tile falls back to the plain spend figure and a
  // link to set one — it must never infer a budget from past spending, which
  // would be the app deciding what the household ought to spend.
  if (totalBudgeted <= 0) return null;

  const { year, monthIndex } = parseMonth(month);
  const daysInMonth = daysIn(year, monthIndex);

  const currentYear = asOf.getUTCFullYear();
  const currentMonthIndex = asOf.getUTCMonth();

  let daysElapsed: number;
  if (year < currentYear || (year === currentYear && monthIndex < currentMonthIndex)) {
    daysElapsed = daysInMonth; // a past month is over
  } else if (year > currentYear || monthIndex > currentMonthIndex) {
    daysElapsed = 0; // a future month has not started
  } else {
    daysElapsed = asOf.getUTCDate();
  }

  const remaining = totalBudgeted - totalSpent;

  return {
    budgeted: totalBudgeted,
    spent: totalSpent,
    remaining,
    pctUsed: Math.round((totalSpent / totalBudgeted) * 100),
    daysElapsed,
    daysInMonth,
    // Spending exactly the budget is not an overrun.
    exceeded: remaining < 0,
  };
}
