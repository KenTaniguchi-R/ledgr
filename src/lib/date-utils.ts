export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function formatMonthShort(month: string): string {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-US", { month: "short" });
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

export function shiftDateRange(
  from: string,
  to: string,
  direction: "back" | "forward",
  isPreset: boolean,
): { from: string; to: string } {
  const sign = direction === "back" ? -1 : 1;

  if (isPreset) {
    const fromDate = new Date(from + "T12:00:00");
    const toDate = new Date(to + "T12:00:00");
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

  const fromDate = new Date(from + "T12:00:00");
  const toDate = new Date(to + "T12:00:00");
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
