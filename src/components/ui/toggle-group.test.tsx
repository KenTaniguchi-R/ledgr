/**
 * @vitest-environment jsdom
 *
 * Arrow-key movement in a ToggleGroup comes from Base UI's composite, which
 * reads `orientation` off the primitive. Our wrapper takes `orientation` as its
 * own prop, so it is one destructure away from being spent on the data
 * attribute and never reaching the composite — which is exactly what happened:
 * a vertical group answered to Left/Right instead of Up/Down.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

function renderGroup(orientation: "horizontal" | "vertical") {
  render(
    <ToggleGroup value={["a"]} onValueChange={() => {}} orientation={orientation} aria-label="Test">
      <ToggleGroupItem value="a">A</ToggleGroupItem>
      <ToggleGroupItem value="b">B</ToggleGroupItem>
      <ToggleGroupItem value="c">C</ToggleGroupItem>
    </ToggleGroup>,
  );
  return ["A", "B", "C"].map((n) => screen.getByRole("button", { name: n }));
}

async function movesFocus(items: HTMLElement[], key: string) {
  items[0].focus();
  fireEvent.keyDown(items[0], { key });
  try {
    await waitFor(() => expect(document.activeElement).toBe(items[1]), { timeout: 300 });
    return true;
  } catch {
    return false;
  }
}

describe("ToggleGroup keyboard navigation", () => {
  it("is a single tab stop, not one per item", () => {
    const items = renderGroup("horizontal");
    expect(items.filter((el) => (el as HTMLButtonElement).tabIndex === 0)).toHaveLength(1);
  });

  it("moves a vertical group with ArrowDown", async () => {
    expect(await movesFocus(renderGroup("vertical"), "ArrowDown")).toBe(true);
  });

  it("does not move a vertical group with ArrowRight", async () => {
    expect(await movesFocus(renderGroup("vertical"), "ArrowRight")).toBe(false);
  });

  it("moves a horizontal group with ArrowRight", async () => {
    expect(await movesFocus(renderGroup("horizontal"), "ArrowRight")).toBe(true);
  });
});
