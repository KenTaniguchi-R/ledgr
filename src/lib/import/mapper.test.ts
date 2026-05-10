import { describe, test, expect } from "vitest";
import { autoDetectMapping } from "./mapper";

describe("autoDetectMapping", () => {
  test("detects standard headers", () => {
    const mapping = autoDetectMapping(["Date", "Amount", "Description"]);
    expect(mapping.date).toBe("Date");
    expect(mapping.amount).toBe("Amount");
    expect(mapping.description).toBe("Description");
  });

  test("detects Chase CSV format", () => {
    const mapping = autoDetectMapping(["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount", "Memo"]);
    expect(mapping.date).toBe("Transaction Date");
    expect(mapping.amount).toBe("Amount");
    expect(mapping.description).toBe("Description");
    expect(mapping.category).toBe("Category");
  });

  test("detects split credit/debit columns", () => {
    const mapping = autoDetectMapping(["Date", "Description", "Debit", "Credit", "Balance"]);
    expect(mapping.date).toBe("Date");
    expect(mapping.description).toBe("Description");
    expect(mapping.debit).toBe("Debit");
    expect(mapping.credit).toBe("Credit");
    expect(mapping.amount).toBeUndefined();
  });

  test("detects case-insensitive headers", () => {
    const mapping = autoDetectMapping(["DATE", "AMOUNT", "NARRATION"]);
    expect(mapping.date).toBe("DATE");
    expect(mapping.amount).toBe("AMOUNT");
    expect(mapping.description).toBe("NARRATION");
  });

  test("returns empty for unrecognized headers", () => {
    const mapping = autoDetectMapping(["Col1", "Col2", "Col3"]);
    expect(mapping.date).toBeUndefined();
    expect(mapping.amount).toBeUndefined();
    expect(mapping.description).toBeUndefined();
  });
});
