import { describe, it, expect } from "vitest";
import { DASHBOARD_WIDGETS, WIDGET_TITLE_MAP, getDefaultLayout } from "./registry";

describe("widget registry", () => {
  it("has no duplicate widget IDs", () => {
    const ids = DASHBOARD_WIDGETS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("title map covers all widgets", () => {
    for (const w of DASHBOARD_WIDGETS) {
      expect(WIDGET_TITLE_MAP.get(w.id)).toBe(w.title);
    }
  });

  it("default layout only contains registered widget IDs", () => {
    const layout = getDefaultLayout();
    const widgetIds = new Set(DASHBOARD_WIDGETS.map((w) => w.id));
    for (const item of layout.desktop) {
      expect(widgetIds.has(item.i)).toBe(true);
    }
  });
});
