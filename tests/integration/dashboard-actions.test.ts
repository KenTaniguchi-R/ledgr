import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { insertHousehold } from "./helpers";
import { userSettings } from "../../src/db/schema";
import { saveLayoutForUser, getLayoutForUser } from "../../src/queries/settings";
import type { DashboardLayout } from "../../src/components/organisms/widgets/registry";
import type { LedgrDb } from "../../src/db";

describe("dashboard actions", () => {
  let db: LedgrDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  it("saves and loads dashboard layout correctly", async () => {
    const userId = uuid();
    await insertHousehold(db);

    const layout: DashboardLayout = {
      desktop: [{ i: "net-worth", x: 0, y: 0, w: 6, h: 2 }],
      tablet: [{ i: "net-worth", x: 0, y: 0, w: 4, h: 2 }],
      mobile: [{ i: "net-worth", x: 0, y: 0, w: 2, h: 2 }],
    };

    await saveLayoutForUser(userId, layout, db);
    const result = await getLayoutForUser(userId, db);

    expect(result).toEqual(layout);
  });

  it("handles corrupted JSON gracefully (returns null)", async () => {
    const userId = uuid();

    await db.insert(userSettings).values({ id: uuid(), userId, dashboardLayout: "not-valid-json{{{" });

    const result = await getLayoutForUser(userId, db);

    expect(result).toBeNull();
  });
});
