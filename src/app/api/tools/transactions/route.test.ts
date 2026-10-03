import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHouseholdId: vi.fn(),
  getToolTransactions: vi.fn(),
  withHousehold: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getHouseholdId: mocks.getHouseholdId,
}));

vi.mock("@/lib/household-context", () => ({
  withHousehold: mocks.withHousehold,
}));

vi.mock("@/queries/transactions", () => ({
  getToolTransactions: mocks.getToolTransactions,
}));

describe("GET /api/tools/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHouseholdId.mockResolvedValue("household-active");
    mocks.getToolTransactions.mockResolvedValue({
      transactions: [],
      nextCursor: null,
    });
    mocks.withHousehold.mockImplementation(async (householdId, work) =>
      work({ householdId }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes the validated narrow filter surface to the scoped query", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(
        "http://localhost/api/tools/transactions?dateFrom=2026-09-01&dateTo=2026-10-01&accountId=account-1&categoryId=category-1&limit=25",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ transactions: [], nextCursor: null });
    expect(mocks.getToolTransactions).toHaveBeenCalledWith(
      "household-active",
      {
        dateFrom: "2026-09-01",
        dateTo: "2026-10-01",
        accountId: "account-1",
        categoryId: "category-1",
      },
      25,
      null,
      { householdId: "household-active" },
    );
  });

  it("defaults to a recent 90-day window and 50 rows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    const { GET } = await import("./route");

    await GET(new Request("http://localhost/api/tools/transactions"));

    expect(mocks.getToolTransactions).toHaveBeenCalledWith(
      "household-active",
      { dateFrom: "2026-07-04", dateTo: "2026-10-02" },
      50,
      null,
      { householdId: "household-active" },
    );
  });

  it.each([
    ["invalid calendar date", "dateFrom=2026-02-30"],
    ["reversed date range", "dateFrom=2026-10-02&dateTo=2026-10-01"],
    ["zero limit", "limit=0"],
    ["limit above the maximum", "limit=101"],
    ["non-integer limit", "limit=1.5"],
    ["malformed cursor", "cursor=not-a-cursor"],
    ["unknown parameter", "sort=date"],
    ["duplicate parameter", "limit=10&limit=20"],
  ])("returns 400 for %s", async (_label, query) => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(`http://localhost/api/tools/transactions?${query}`),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "invalid_request",
      message: expect.any(String),
    });
    expect(mocks.getHouseholdId).not.toHaveBeenCalled();
    expect(mocks.getToolTransactions).not.toHaveBeenCalled();
  });
});
