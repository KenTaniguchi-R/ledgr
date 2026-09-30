import { expect, test } from "@playwright/test";

test("creates a custom category group and category", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const password = "playwright-password";

  await page.goto("/signup");
  await page.getByLabel("Name").fill("Category Test");
  await page.getByLabel("Email").fill(`categories-${unique}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/categories");
  await expect(page.getByRole("heading", { name: "Categories" })).toBeVisible();
  await expect(page.getByText("System").first()).toBeVisible();

  await page.getByLabel("Group name").fill("Family");
  await page.getByRole("button", { name: "Add group" }).click();
  await expect(page.getByRole("button", { name: "Rename group Family" })).toBeVisible();

  await page.getByLabel("Category name").fill("Childcare");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByRole("button", { name: "Rename category Childcare" })).toBeVisible();
});
