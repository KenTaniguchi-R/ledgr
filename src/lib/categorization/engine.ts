export interface CategorizableTransaction {
  id: string;
  name: string;
  merchantId: string | null;
  merchantName: string | null;
  merchantCategoryId: string | null;
}

export interface CategoryRule {
  id: string;
  categoryId: string;
  matchField: "name" | "merchant";
  matchPattern: string;
  priority: number;
}

export interface CategoryAssignment {
  transactionId: string;
  categoryId: string;
  source: "rule" | "merchant_default";
}

export function categorizeTransactions(
  transactions: CategorizableTransaction[],
  rules: CategoryRule[],
): CategoryAssignment[] {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const assignments: CategoryAssignment[] = [];

  for (const txn of transactions) {
    let matched = false;

    for (const rule of sorted) {
      const target =
        rule.matchField === "merchant" ? txn.merchantName : txn.name;
      if (!target) continue;

      if (target.toLowerCase().includes(rule.matchPattern.toLowerCase())) {
        assignments.push({
          transactionId: txn.id,
          categoryId: rule.categoryId,
          source: "rule",
        });
        matched = true;
        break;
      }
    }

    if (!matched && txn.merchantCategoryId) {
      assignments.push({
        transactionId: txn.id,
        categoryId: txn.merchantCategoryId,
        source: "merchant_default",
      });
    }
  }

  return assignments;
}
