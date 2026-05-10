export interface DateGroup<T extends { date: string }> {
  date: string;
  rows: T[];
}

export function groupByDate<T extends { date: string }>(rows: T[]): DateGroup<T>[] {
  const groups: DateGroup<T>[] = [];
  let current: DateGroup<T> | null = null;

  for (const row of rows) {
    if (current && current.date === row.date) {
      current.rows.push(row);
    } else {
      current = { date: row.date, rows: [row] };
      groups.push(current);
    }
  }

  return groups;
}
