/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CategoryGroup } from "@/queries/categories";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/actions/categories", () => ({
  createCategory: vi.fn(),
  createCategoryGroup: vi.fn(),
  deleteCategory: vi.fn(),
  deleteCategoryGroup: vi.fn(),
  renameCategory: vi.fn(),
  renameCategoryGroup: vi.fn(),
}));

const groups: CategoryGroup[] = [
  {
    id: "group-uuid-one",
    name: "Everyday",
    icon: null,
    sortOrder: 0,
    isSystem: true,
    categories: [
      {
        id: "system-category",
        name: "Groceries",
        icon: null,
        isIncome: false,
        isSystem: true,
        sortOrder: 0,
      },
    ],
  },
  {
    id: "group-uuid-two",
    name: "Family",
    icon: null,
    sortOrder: 1,
    isSystem: false,
    categories: [
      {
        id: "custom-category",
        name: "Childcare",
        icon: null,
        isIncome: false,
        isSystem: false,
        sortOrder: 0,
      },
    ],
  },
];

describe("CategoryManager group selection", () => {
  beforeAll(() => {
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false;
    }
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = () => {};
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = () => {};
    }
  });

  it("renders the selected group name instead of its ID", async () => {
    const { CategoryManager } = await import("./category-manager");
    render(<CategoryManager groups={groups} />);

    const trigger = screen.getByRole("combobox", { name: "Category group" });
    expect(trigger.textContent).toContain("Everyday");
    expect(trigger.textContent).not.toContain("group-uuid-one");

    fireEvent.click(trigger);
    const option = await screen.findByRole("option", { name: "Family" });
    expect(option.textContent).toContain("Family");
  });

  it("shows explicit rename controls for custom records only", async () => {
    const { CategoryManager } = await import("./category-manager");
    render(<CategoryManager groups={groups} />);

    const renameGroup = screen.getByRole("button", { name: "Rename group Family" });
    const renameCategory = screen.getByRole("button", { name: "Rename category Childcare" });
    expect(renameGroup.querySelector("svg")).not.toBeNull();
    expect(renameCategory.querySelector("svg")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Rename group Everyday" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename category Groceries" })).toBeNull();

    fireEvent.click(renameCategory);
    expect(await screen.findByDisplayValue("Childcare")).not.toBeNull();
  });
});
