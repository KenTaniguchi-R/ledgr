import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { insertHousehold, insertAccount } from "./helpers";
import { balanceHistory } from "../../src/db/schema";
import { getNetWorthHistory } from "../../src/queries/dashboard";
import { formatNetWorthHistory } from "../../src/lib/mcp/tools/dashboard";
import type { LedgrDb } from "../../src/db";

// End-to-end coverage for the get_net_worth_history MCP tool's data path:
// real balance_history SQL → formatNetWorthHistory → agent-facing wire shape.
// The only thing not exercised here is the SDK JSON-RPC transport, which is
// shared, unchanged plumbing identical to every other read tool.

let db: LedgrDb;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  await close();
});

function firstOfLastMonth(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

describe("get_net_worth_history tool data path", () => {
  it("returns a dated series with cents and display for real balance history", async () => {
    const { householdId } = await insertHousehold(db);
    const { accountId: checkingId } = await insertAccount(db, householdId, {
      type: "checking",
      currentBalance: 80000,
    });
    const { accountId: creditId } = await insertAccount(db, householdId, {
      type: "credit",
      currentBalance: 20000,
    });

    const histDate = firstOfLastMonth();
    await db.insert(balanceHistory).values({ id: uuid(), accountId: checkingId, date: histDate, balance: 70000 });
    await db.insert(balanceHistory).values({ id: uuid(), accountId: creditId, date: histDate, balance: 15000 });

    const points = await getNetWorthHistory(householdId, "3M", db);
    const wire = formatNetWorthHistory(points);

    const historical = wire.find((p) => p.date === histDate);
    expect(historical).toEqual({
      date: histDate,
      assetsCents: 70000,
      assetsDisplay: "$700.00",
      liabilitiesCents: 15000,
      liabilitiesDisplay: "$150.00",
      netWorthCents: 55000,
      netWorthDisplay: "$550.00",
    });

    const today = new Date().toISOString().slice(0, 10);
    const todayPoint = wire.find((p) => p.date === today);
    expect(todayPoint).toEqual({
      date: today,
      assetsCents: 80000,
      assetsDisplay: "$800.00",
      liabilitiesCents: 20000,
      liabilitiesDisplay: "$200.00",
      netWorthCents: 60000,
      netWorthDisplay: "$600.00",
    });
  });

  it("returns an empty series when no account carries a balance", async () => {
    const { householdId } = await insertHousehold(db);
    await insertAccount(db, householdId, { type: "checking", currentBalance: null });

    const wire = formatNetWorthHistory(await getNetWorthHistory(householdId, "6M", db));

    expect(wire).toEqual([]);
  });
});
