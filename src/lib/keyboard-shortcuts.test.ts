// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { isEditableShortcutTarget } from "./keyboard-shortcuts";

describe("isEditableShortcutTarget", () => {
  it.each(["input", "textarea", "select"])("ignores shortcuts in %s elements", (tag) => {
    expect(isEditableShortcutTarget(document.createElement(tag))).toBe(true);
  });

  it("ignores descendants of editable content", () => {
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editor.append(child);

    expect(isEditableShortcutTarget(child)).toBe(true);
  });

  it("allows shortcuts from non-editable content", () => {
    const target = document.createElement("button");
    const disabledEditor = document.createElement("div");
    disabledEditor.setAttribute("contenteditable", "false");

    expect(isEditableShortcutTarget(target)).toBe(false);
    expect(isEditableShortcutTarget(disabledEditor)).toBe(false);
  });
});
