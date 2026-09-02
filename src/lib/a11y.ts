import type { KeyboardEvent } from "react";

/**
 * Enter/Space activation for an element that is clickable but is not a
 * `<button>` — a table row, a chart legend entry.
 *
 * Returning `undefined` when there is nothing to activate lets a caller spread
 * the result unconditionally: an inert row then gets no handler, and so keeps
 * its `tabIndex` off and stays out of the tab order.
 */
export function activateOnKey(
  onActivate: (() => void) | undefined,
): ((e: KeyboardEvent) => void) | undefined {
  if (!onActivate) return undefined;
  return (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    // Space scrolls the page by default, which is not what pressing a control does.
    e.preventDefault();
    onActivate();
  };
}
