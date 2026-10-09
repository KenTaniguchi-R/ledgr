// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { escapeKeyAction, isEditableShortcutTarget } from "./keyboard-shortcuts";

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

describe("escapeKeyAction", () => {
  it("blurs editable fields and closes from non-editable targets", () => {
    expect(escapeKeyAction(document.createElement("textarea"))).toBe("blur");
    expect(escapeKeyAction(document.createElement("button"))).toBe("close");
  });

  it("leaves open popups to their own Escape handling", () => {
    const input = document.createElement("input");
    input.setAttribute("aria-expanded", "true");
    const list = document.createElement("div");
    list.setAttribute("role", "listbox");
    const option = document.createElement("div");
    list.append(option);

    expect(escapeKeyAction(input)).toBe("ignore");
    expect(escapeKeyAction(option)).toBe("ignore");
  });
});
