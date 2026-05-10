import { test, expect } from "@playwright/test";

test.describe("accounts page", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/accounts");
    await expect(page).toHaveURL(/\/login/);
  });

  // Full Plaid Link E2E requires sandbox credentials.
  // To test locally:
  // 1. Set PLAID_CLIENT_ID and PLAID_SECRET in .env
  // 2. Set PLAID_ENV=sandbox
  // 3. Use Plaid sandbox credentials: user_good / pass_good
  test.skip("full Plaid Link flow", async () => {
    // Sign up / sign in
    // Navigate to /accounts
    // Click "Connect Bank"
    // Complete Plaid Link with sandbox credentials
    // Verify accounts appear on page
  });
});
