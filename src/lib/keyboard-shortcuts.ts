const EDITABLE_TARGET_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="listbox"], [role="menu"]';

/** Global shortcuts must yield to controls that own ordinary keystrokes. */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return (target as Element).closest(EDITABLE_TARGET_SELECTOR) !== null;
}

const POPUP_SELECTOR = '[role="listbox"], [role="menu"], [aria-expanded="true"]';

/**
 * What Escape should do for a focused target. A target inside, or controlling,
 * an open popup is left to the popup's own dismissal; a text field is blurred
 * so a second Escape can close the surrounding panel.
 */
export function escapeKeyAction(target: EventTarget | null): "ignore" | "blur" | "close" {
  if (target && typeof (target as Element).closest === "function") {
    if ((target as Element).closest(POPUP_SELECTOR) !== null) return "ignore";
  }
  return isEditableShortcutTarget(target) ? "blur" : "close";
}
