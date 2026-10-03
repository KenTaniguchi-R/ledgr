import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHouseholdId: vi.fn(),
  getToolAccounts: vi.fn(),
  withHousehold: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getHouseholdId: mocks.getHouseholdId,
}));

vi.mock("@/lib/household-context", () => ({
  withHousehold: mocks.withHousehold,
}));

vi.mock("@/queries/accounts", () => ({
  getToolAccounts: mocks.getToolAccounts,
}));

describe("GET /api/tools/accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHouseholdId.mockResolvedValue("household-active");
    mocks.withHousehold.mockImplementation(async (householdId, work) =>
      work({ householdId }),
    );
  });

  it("returns deterministic JSON with explicitly named cent values", async () => {
    mocks.getToolAccounts.mockResolvedValue([
      {
        id: "account-1",
        name: "Everyday Checking",
        type: "checking",
        subtype: "checking",
        institution: "Test Bank",
        isHidden: false,
        currentBalanceCents: 123456,
        availableBalanceCents: 120000,
        currency: "USD",
      },
    ]);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe(
      '{"accounts":[{"id":"account-1","name":"Everyday Checking","type":"checking","subtype":"checking","institution":"Test Bank","isHidden":false,"currentBalanceCents":123456,"availableBalanceCents":120000,"currency":"USD"}]}',
    );
  });

  it("uses only the authenticated household and exposes only GET", async () => {
    mocks.getToolAccounts.mockResolvedValue([]);

    const route = await import("./route");
    const response = await route.GET();

    expect(await response.json()).toEqual({ accounts: [] });
    expect(mocks.getHouseholdId).toHaveBeenCalledOnce();
    expect(mocks.withHousehold).toHaveBeenCalledWith(
      "household-active",
      expect.any(Function),
    );
    expect(mocks.getToolAccounts).toHaveBeenCalledWith(
      "household-active",
      { householdId: "household-active" },
    );
    expect(Object.keys(route)).toEqual(["GET"]);
  });
});
