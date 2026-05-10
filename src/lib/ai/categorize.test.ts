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
      [{ id: "txn-1", description: "STARBUCKS #123", amount: -550 }],
      categories,
      [],
    );
    expect(prompt).toContain("cat-1");
    expect(prompt).toContain("Coffee");
    expect(prompt).toContain("Food & Drink");
  });

  test("includes transaction details", () => {
    const prompt = buildCategorizationPrompt(
      [{ id: "txn-1", description: "STARBUCKS #123", amount: -550 }],
      categories,
      [],
    );
    expect(prompt).toContain("txn-1");
    expect(prompt).toContain("STARBUCKS #123");
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
