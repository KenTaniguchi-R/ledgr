import { describe, it, expect } from "vitest";
import { DASHBOARD_WIDGETS, WIDGET_TITLE_MAP, getDefaultLayout, sameLayout, toGridItems } from "./registry";

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

describe("sameLayout", () => {
  const saved = [
    { i: "accounts", x: 1, y: 0, w: 1, h: 2 },
    { i: "bills", x: 0, y: 2, w: 1, h: 2 },
  ];

  it("treats RGL's padded echo of the same positions as unchanged", () => {
    // What onLayoutChange hands back on mount: same placement, extra fields,
    // possibly reordered. Saving on this wrote the layout on every page view.
    const echoed = [
      { ...saved[1], moved: false, static: false },
      { ...saved[0], moved: false, static: false, minW: undefined },
    ];
    expect(sameLayout(toGridItems(echoed), saved)).toBe(true);
  });

  it("sees a dragged widget as a change", () => {
    const dragged = [saved[0], { ...saved[1], y: 4 }];
    expect(sameLayout(dragged, saved)).toBe(false);
  });

  it("toGridItems keeps only the persisted fields", () => {
    expect(toGridItems([{ ...saved[0], moved: false } as never])).toEqual([saved[0]]);
  });
});
