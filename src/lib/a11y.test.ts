import { describe, test, expect, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { activateOnKey } from "./a11y";

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

describe("activateOnKey", () => {
  test("returns nothing when there is no action, so the element stays untabbable", () => {
    expect(activateOnKey(undefined)).toBeUndefined();
  });

  test("Enter activates", () => {
    const onActivate = vi.fn();
    const e = keyEvent("Enter");
    activateOnKey(onActivate)!(e);
    expect(onActivate).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  test("Space activates, and does not also scroll the page", () => {
    const onActivate = vi.fn();
    const e = keyEvent(" ");
    activateOnKey(onActivate)!(e);
    expect(onActivate).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalled();
  });

  test("any other key is left alone", () => {
    const onActivate = vi.fn();
    for (const key of ["Tab", "a", "Escape", "ArrowDown", "Spacebar"]) {
      const e = keyEvent(key);
      activateOnKey(onActivate)!(e);
      expect(onActivate).not.toHaveBeenCalled();
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
  });
});
