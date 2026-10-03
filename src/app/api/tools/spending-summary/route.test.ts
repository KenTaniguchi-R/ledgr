import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHouseholdId: vi.fn(),
  getToolSpendingSummary: vi.fn(),
  withHousehold: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getHouseholdId: mocks.getHouseholdId,
}));

vi.mock("@/lib/household-context", () => ({
  withHousehold: mocks.withHousehold,
}));

vi.mock("@/queries/reports", () => ({
  getToolSpendingSummary: mocks.getToolSpendingSummary,
}));

describe("GET /api/tools/spending-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHouseholdId.mockResolvedValue("household-active");
    mocks.getToolSpendingSummary.mockResolvedValue({
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      totalSpendingCents: 0,
      categories: [],
    });
    mocks.withHousehold.mockImplementation(async (householdId, work) =>
      work({ householdId }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes the validated narrow filter surface to the scoped report query", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "http://localhost/api/tools/spending-summary?dateFrom=2026-09-01&dateTo=2026-09-30&accountId=account-1&categoryId=category-1",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.getToolSpendingSummary).toHaveBeenCalledWith(
      "household-active",
      {
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
        accountIds: ["account-1"],
        categoryIds: ["category-1"],
      },
      { householdId: "household-active" },
    );
  });

  it("defaults to a recent 90-day window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/tools/spending-summary"));

    expect(mocks.getToolSpendingSummary).toHaveBeenCalledWith(
      "household-active",
      { dateFrom: "2026-07-04", dateTo: "2026-10-02" },
      { householdId: "household-active" },
    );
  });

  it.each([
    ["invalid calendar date", "dateFrom=2026-02-30&dateTo=2026-03-01"],
    ["only one date", "dateFrom=2026-09-01"],
    ["reversed range", "dateFrom=2026-10-02&dateTo=2026-10-01"],
    ["empty account", "accountId="],
    ["unknown parameter", "limit=10"],
    ["duplicate parameter", "categoryId=one&categoryId=two"],
  ])("returns 400 for %s", async (_label, query) => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(`http://localhost/api/tools/spending-summary?${query}`),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_request",
      message: expect.any(String),
    });
    expect(mocks.getHouseholdId).not.toHaveBeenCalled();
    expect(mocks.getToolSpendingSummary).not.toHaveBeenCalled();
  });
});
