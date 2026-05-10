export function budgetProgressPercent(spent: number, limit: number): number {
  if (limit === 0) return spent > 0 ? 100 : 0;
  return Math.round((spent / limit) * 100);
}
