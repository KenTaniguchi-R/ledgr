// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useReviewKeyboard, type ReviewKeyboardHandlers } from "./use-review-keyboard";

function createHandlers(): ReviewKeyboardHandlers {
  return {
    onConfirm: vi.fn(),
    onSkip: vi.fn(),
    onRetreat: vi.fn(),
    onEditCategory: vi.fn(),
    onEditNotes: vi.fn(),
    onExit: vi.fn(),
  };
}

describe("useReviewKeyboard", () => {
  it.each(["input", "textarea", "select"])("does not fire E while typing in a %s", (tag) => {
    const handlers = createHandlers();
    renderHook(() => useReviewKeyboard("VIEWING", handlers, true));
    const target = document.createElement(tag);
    document.body.append(target);

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "e", bubbles: true, cancelable: true }));

    expect(handlers.onEditCategory).not.toHaveBeenCalled();
  });

  it("does not fire a shortcut inside contenteditable", () => {
    const handlers = createHandlers();
    renderHook(() => useReviewKeyboard("VIEWING", handlers, true));
    const target = document.createElement("div");
    target.setAttribute("contenteditable", "true");
    document.body.append(target);

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true }));

    expect(handlers.onEditNotes).not.toHaveBeenCalled();
  });

  it("fires E outside editable controls", () => {
    const handlers = createHandlers();
    renderHook(() => useReviewKeyboard("VIEWING", handlers, true));

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "E", bubbles: true, cancelable: true }),
    );

    expect(handlers.onEditCategory).toHaveBeenCalledOnce();
  });
});
