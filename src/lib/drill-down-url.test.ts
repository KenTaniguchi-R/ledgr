import { describe, it, expect } from "vitest";
import { drillDownTransactionsUrl } from "./drill-down-url";

describe("drillDownTransactionsUrl", () => {
  const range = { dateFrom: "2026-06-01", dateTo: "2026-08-31" };

  it("passes a real category through as its id", () => {
    const url = drillDownTransactionsUrl({ categoryId: "cat-groceries", ...range });
    expect(url).toBe("/transactions?category=cat-groceries&from=2026-06-01&to=2026-08-31");
  });

  it("encodes a null category as the uncategorized sentinel", () => {
    const url = drillDownTransactionsUrl({ categoryId: null, ...range });
    expect(new URLSearchParams(url.split("?")[1]).get("category")).toBe("uncategorized");
  });

  it("omits the category param entirely when no category is filtered", () => {
    const url = drillDownTransactionsUrl(range);
    expect(url).toBe("/transactions?from=2026-06-01&to=2026-08-31");
  });

  it("narrows the range to the month when drilling into one", () => {
    const url = drillDownTransactionsUrl({ categoryId: null, month: "2026-07", ...range });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("from")).toBe("2026-07-01");
    expect(params.get("to")).toBe("2026-07-31");
  });
});
