import { describe, it, expect, vi } from "vitest";

const setBudgetCategoryScoped = vi.fn(async () => ({ success: true as const }));
vi.mock("@/actions/budgets", () => ({
  setBudgetCategoryScoped,
}));
vi.mock("@/queries/budgets", () => ({
  getBudgetForMonth: vi.fn(),
}));

describe("registerBudgetWriteTools", () => {
  it("calls setBudgetCategoryScoped with the registrar's householdId, not a cookie session", async () => {
    const { registerBudgetWriteTools } = await import("./budgets");

    let handler: ((args: unknown) => Promise<unknown>) | undefined;
    const fakeServer = {
      registerTool: (_name: string, _cfg: unknown, fn: (args: unknown) => Promise<unknown>) => {
        handler = fn;
      },
    };

    registerBudgetWriteTools(fakeServer as never, "household-A");
    await handler!({ budgetId: "budget-1", categoryId: "cat-1", limitAmountCents: 5000 });

    expect(setBudgetCategoryScoped).toHaveBeenCalledWith("household-A", "budget-1", "cat-1", 5000);
  });
});
