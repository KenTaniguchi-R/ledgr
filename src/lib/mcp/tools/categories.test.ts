import { describe, it, expect, vi } from "vitest";

const updateTransactionCategoryScoped = vi.fn(async () => ({ success: true as const }));
vi.mock("@/actions/transactions", () => ({
  updateTransactionCategoryScoped,
}));
vi.mock("@/queries/categories", () => ({
  getCategories: vi.fn(),
}));

describe("registerCategoryWriteTools", () => {
  it("calls updateTransactionCategoryScoped with the registrar's householdId, not a cookie session", async () => {
    const { registerCategoryWriteTools } = await import("./categories");

    let handler: ((args: unknown) => Promise<unknown>) | undefined;
    const fakeServer = {
      registerTool: (_name: string, _cfg: unknown, fn: (args: unknown) => Promise<unknown>) => {
        handler = fn;
      },
    };

    registerCategoryWriteTools(fakeServer as never, "household-A");
    await handler!({ transactionId: "txn-1", categoryId: "cat-1" });

    expect(updateTransactionCategoryScoped).toHaveBeenCalledWith("household-A", "txn-1", "cat-1");
  });
});
