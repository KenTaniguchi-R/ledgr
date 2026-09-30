const EDITABLE_TARGET_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="listbox"], [role="menu"]';

/** Global shortcuts must yield to controls that own ordinary keystrokes. */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  return (target as Element).closest(EDITABLE_TARGET_SELECTOR) !== null;
}
