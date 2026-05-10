import { describe, it, expect } from "vitest";
import { DASHBOARD_WIDGETS, ACTIVE_WIDGETS, getDefaultLayout } from "./registry";

describe("widget registry", () => {
  it("has no duplicate widget IDs", () => {
    const ids = DASHBOARD_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("default layout only contains active widget IDs", () => {
    const layout = getDefaultLayout();
    const activeIds = new Set(ACTIVE_WIDGETS.map((w) => w.id));
    for (const item of layout.desktop) {
      expect(activeIds.has(item.i)).toBe(true);
    }
  });
});
