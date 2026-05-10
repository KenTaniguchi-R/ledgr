import { describe, it, expect } from "vitest";
import { DASHBOARD_WIDGETS, ACTIVE_WIDGETS, getDefaultLayout } from "./registry";

describe("widget registry", () => {
  it("has no duplicate widget IDs", () => {
    const ids = DASHBOARD_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("default layout includes all active widget IDs", () => {
    const layout = getDefaultLayout();
    const layoutIds = new Set(layout.desktop.map((item) => item.i));
    for (const widget of ACTIVE_WIDGETS) {
      expect(layoutIds.has(widget.id)).toBe(true);
    }
  });
});
