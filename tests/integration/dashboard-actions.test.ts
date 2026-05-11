import { describe, it, expect, afterEach } from "vitest";
import { v4 as uuid } from "uuid";
import { createTestDb } from "./setup";
import { insertHousehold } from "./helpers";
import { userSettings } from "../../src/db/schema";
import { saveLayoutForUser, getLayoutForUser } from "../../src/queries/settings";
import type { DashboardLayout } from "../../src/components/organisms/widgets/registry";

describe("dashboard actions", () => {
  const { db } = createTestDb();

  afterEach(() => {
    // Clean up user_settings after each test
    db.delete(userSettings).run();
  });

  it("saves and loads dashboard layout correctly", async () => {
    const userId = uuid();
    insertHousehold(db);

    const layout: DashboardLayout = {
      desktop: [{ i: "net-worth", x: 0, y: 0, w: 6, h: 2 }],
      tablet: [{ i: "net-worth", x: 0, y: 0, w: 4, h: 2 }],
      mobile: [{ i: "net-worth", x: 0, y: 0, w: 2, h: 2 }],
    };

    saveLayoutForUser(userId, layout, db);
    const result = getLayoutForUser(userId, db);

    expect(result).toEqual(layout);
  });

  it("handles corrupted JSON gracefully (returns null)", async () => {
    const userId = uuid();

    // Insert a row with corrupted JSON directly
    db.insert(userSettings)
      .values({ id: uuid(), userId, dashboardLayout: "not-valid-json{{{" })
      .run();

    const result = getLayoutForUser(userId, db);

    expect(result).toBeNull();
  });
});
