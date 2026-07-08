import { test, expect } from "@playwright/test";

/**
 * End-to-end passkey flow using a CDP virtual authenticator (no hardware needed):
 * sign up → register a passkey in Settings → sign out → sign in with the passkey.
 */
test("register and sign in with a passkey", async ({ page }) => {
  // Attach a virtual platform authenticator with automatic user verification.
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  const email = `passkey-${Date.now()}@example.com`;
  const password = "password1234";

  // Sign up (auto signs in).
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Passkey Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).not.toHaveURL(/\/signup/);

  // Register a passkey from Settings.
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible();
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText(/\d+ active/)).toBeVisible();

  // Sign out by clearing the session cookie.
  await page.context().clearCookies();

  // Sign in with the registered passkey.
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).not.toHaveURL(/\/login/);
});
