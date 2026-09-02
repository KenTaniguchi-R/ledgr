export function todayDateString(): string {
  return formatLocalDate(new Date());
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function formatMonthShort(month: string): string {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "short" });
}

export function formatDateShort(date: string): string {
  const d = new Date(date + "T00:00:00");
  // The year is only shown when it is not the current one. Most dates on screen
  // are recent, where a year is noise (and would crowd chart axis ticks), but
  // without it an older range reads as "Jan 1 - Mar 31" with nothing saying
  // which year, and a year-over-year comparison label is indistinguishable
  // from this year's.
  const showYear = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(showYear ? { year: "numeric" } : {}),
  });
}

export function formatMonthLong(month: string): string {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function rangeToDateBounds(range: string): { from: string | null; to: string } {
  const to = todayDateString();
  const now = new Date();
  switch (range) {
    case "1M":
      now.setMonth(now.getMonth() - 1);
      return { from: now.toISOString().slice(0, 10), to };
    case "3M":
      now.setMonth(now.getMonth() - 3);
      return { from: now.toISOString().slice(0, 10), to };
    case "6M":
      now.setMonth(now.getMonth() - 6);
      return { from: now.toISOString().slice(0, 10), to };
    case "1Y":
      now.setFullYear(now.getFullYear() - 1);
      return { from: now.toISOString().slice(0, 10), to };
    case "all":
      return { from: null, to };
    default:
      return { from: null, to };
  }
}

export function monthBounds(monthStr: string): { from: string; to: string } {
  const [year, month] = monthStr.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${monthStr}-01`,
    to: `${monthStr}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** True when the range covers whole calendar months end to end (1st -> last). */
function isWholeMonthSpan(fromDate: Date, toDate: Date): boolean {
  const lastDayOfToMonth = new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0).getDate();
  return fromDate.getDate() === 1 && toDate.getDate() === lastDayOfToMonth;
}

export function shiftDateRange(
  from: string,
  to: string,
  direction: "back" | "forward",
  isPreset: boolean,
): { from: string; to: string } {
  const sign = direction === "back" ? -1 : 1;
  const fromDate = new Date(from + "T12:00:00");
  const toDate = new Date(to + "T12:00:00");

  // Calendar-month arithmetic only makes sense for a range that actually spans
  // whole months (Apr 1 - Jun 30). `rangeToDateBounds` returns a *rolling*
  // window instead (Jun 2 - Sep 2), which touches four calendar months: the
  // month-span arithmetic counted 4, and the end-of-month snap then stretched
  // the baseline to 118 days against a 92-day window. A rolling window shifts
  // by its own length, so the baseline is always the period immediately before
  // it and exactly as long.
  if (isPreset && isWholeMonthSpan(fromDate, toDate)) {
    const monthSpan =
      (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
      (toDate.getMonth() - fromDate.getMonth()) + 1;
    const newFrom = new Date(fromDate);
    newFrom.setMonth(newFrom.getMonth() + sign * monthSpan);
    // Snap "to" to end-of-month: move to shifted month, then use day 0 of next month
    const newToYear = toDate.getFullYear();
    const newToMonth = toDate.getMonth() + sign * monthSpan;
    const lastDayOfNewMonth = new Date(newToYear, newToMonth + 1, 0).getDate();
    const newTo = new Date(newToYear, newToMonth, lastDayOfNewMonth, 12);
    return {
      from: formatLocalDate(newFrom),
      to: formatLocalDate(newTo),
    };
  }

  const daySpan = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
  const newFrom = new Date(fromDate);
  newFrom.setDate(newFrom.getDate() + sign * daySpan);
  const newTo = new Date(toDate);
  newTo.setDate(newTo.getDate() + sign * daySpan);
  return {
    from: formatLocalDate(newFrom),
    to: formatLocalDate(newTo),
  };
}

export function comparisonLabel(from: string, to: string): string {
  const fromDate = new Date(from + "T00:00:00");
  const toDate = new Date(to + "T00:00:00");
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `vs ${fmt(fromDate)} – ${fmt(toDate)}`;
}

export type BillStatus = "overdue" | "due-soon" | "upcoming" | "inactive";

export function deriveBillStatus(
  nextDate: string | null,
  isActive: boolean,
): BillStatus {
  if (!isActive) return "inactive";
  if (!nextDate) return "upcoming";
  const today = todayDateString();
  if (nextDate < today) return "overdue";
  const threeDaysOut = new Date();
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);
  const threshold = threeDaysOut.toISOString().slice(0, 10);
  if (nextDate <= threshold) return "due-soon";
  return "upcoming";
}

export function relativeDateLabel(dateStr: string): string {
  const today = new Date(todayDateString() + "T12:00:00");
  const target = new Date(dateStr + "T12:00:00");
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86400000,
  );
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays <= 7) return `in ${diffDays} days`;
  return target.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Label the span of dates an account's transactions cover, e.g.
 * "Feb 11 – May 11, 2026". Used on disconnected accounts in the Reports
 * filter, where the span is what distinguishes a superseded account from a
 * duplicated one — the old account stops where its replacement begins.
 *
 * The year is stated once when the span sits inside a single year, and on
 * both ends when it crosses one, so the range is never ambiguous.
 */
export function formatTxnSpan(from: string, to: string): string {
  const fromDate = new Date(from + "T00:00:00");
  const toDate = new Date(to + "T00:00:00");
  const md = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const mdy = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  if (from === to) return mdy(fromDate);
  if (fromDate.getFullYear() !== toDate.getFullYear()) {
    return `${mdy(fromDate)} – ${mdy(toDate)}`;
  }
  return `${md(fromDate)} – ${mdy(toDate)}`;
}
