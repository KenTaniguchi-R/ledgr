import { describe, test, expect } from "vitest";
import { buildCategorizationPrompt, validateAssignments } from "./categorize";

describe("buildCategorizationPrompt", () => {
  const categories = [
    { id: "cat-1", name: "Coffee", groupName: "Food & Drink" },
    { id: "cat-2", name: "Groceries", groupName: "Food & Drink" },
    { id: "cat-3", name: "Salary", groupName: "Income" },
  ];

  test("includes all categories with IDs", () => {
    const prompt = buildCategorizationPrompt(
      [{ id: "txn-1", description: "STARBUCKS #123", normalizedAmount: -550 }],
      categories,
      [],
    );
    expect(prompt).toContain("cat-1");
    expect(prompt).toContain("Coffee");
    expect(prompt).toContain("Food & Drink");
  });

  test("includes transaction details", () => {
    const prompt = buildCategorizationPrompt(
      [{ id: "txn-1", description: "STARBUCKS #123", normalizedAmount: -550 }],
      categories,
      [],
    );
    expect(prompt).toContain("txn-1");
    expect(prompt).toContain("STARBUCKS #123");
  });
});

describe("buildCategorizationPrompt expense/income labelling", () => {
  const categories = [{ id: "cat-1", name: "Coffee", groupName: "Food & Drink" }];

  // Regression: the prompt used to read the raw `amount` column with Plaid's
  // positive-is-debit rule. SimpleFIN stores negative-is-debit, so every
  // SimpleFIN expense was announced to the model as income — and the default
  // taxonomy's only generic bucket is "Other Income", so unknown expenses
  // landed there and counted as income in reports.
  test("labels a negative normalized amount as an expense", () => {
    const prompt = buildCategorizationPrompt(
      [{ id: "txn-1", description: "SEVEN-ELEVEN", normalizedAmount: -209 }],
      categories,
      [],
    );
    expect(prompt).toContain("$2.09 (expense)");
  });

  test("labels a positive normalized amount as income", () => {
    const prompt = buildCategorizationPrompt(
      [{ id: "txn-2", description: "IRS TREAS TAX REF", normalizedAmount: 158100 }],
      categories,
      [],
    );
    expect(prompt).toContain("$1581.00 (income)");
  });

  test("tells the model not to cross the expense/income line", () => {
    const prompt = buildCategorizationPrompt(
      [{ id: "txn-3", description: "ALPENGROUP", normalizedAmount: -4600 }],
      categories,
      [],
    );
    expect(prompt).toMatch(/never assign an expense to an income category/i);
  });
});

describe("validateAssignments", () => {
  const validCategoryIds = new Set(["cat-1", "cat-2", "cat-3"]);
  const batchTransactionIds = new Set(["txn-1", "txn-2"]);

  test("accepts valid assignments", () => {
    const assignments = [
      { transactionId: "txn-1", categoryId: "cat-1", confidence: 0.9 },
    ];
    const result = validateAssignments(
      assignments,
      validCategoryIds,
      batchTransactionIds,
    );
    expect(result).toHaveLength(1);
  });

  test("rejects hallucinated categoryIds", () => {
    const assignments = [
      { transactionId: "txn-1", categoryId: "fake-id", confidence: 0.9 },
    ];
    const result = validateAssignments(
      assignments,
      validCategoryIds,
      batchTransactionIds,
    );
    expect(result).toHaveLength(0);
  });

  test("rejects an income category for an outflow", () => {
    // Reports exclude income categories from spend, so an expense filed under
    // one vanishes from spending and inflates income — worse than leaving it
    // uncategorized. Seen in practice when the taxonomy has no generic
    // expense bucket and the model reaches for "Other Income".
    const result = validateAssignments(
      [{ transactionId: "txn-1", categoryId: "cat-3", confidence: 0.4 }],
      validCategoryIds,
      batchTransactionIds,
      new Set(["cat-3"]),
      new Set(),
    );
    expect(result).toHaveLength(0);
  });

  test("allows an income category for an inflow", () => {
    const result = validateAssignments(
      [{ transactionId: "txn-1", categoryId: "cat-3", confidence: 0.9 }],
      validCategoryIds,
      batchTransactionIds,
      new Set(["cat-3"]),
      new Set(["txn-1"]),
    );
    expect(result).toHaveLength(1);
  });

  test("allows an expense category for an inflow, so a refund can offset it", () => {
    const result = validateAssignments(
      [{ transactionId: "txn-1", categoryId: "cat-1", confidence: 0.9 }],
      validCategoryIds,
      batchTransactionIds,
      new Set(["cat-3"]),
      new Set(["txn-1"]),
    );
    expect(result).toHaveLength(1);
  });

  test("rejects hallucinated transactionIds", () => {
    const assignments = [
      { transactionId: "txn-99", categoryId: "cat-1", confidence: 0.9 },
    ];
    const result = validateAssignments(
      assignments,
      validCategoryIds,
      batchTransactionIds,
    );
    expect(result).toHaveLength(0);
  });
});
