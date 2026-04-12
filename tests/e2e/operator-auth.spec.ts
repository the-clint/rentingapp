import { test, expect } from "@playwright/test";
import {
  createTestUserViaAdmin,
  generateTestEmail,
  TEST_PASSWORD,
} from "./helpers/test-user";

// Notes:
// - shadcn/ui CardTitle renders as a <div>, so we assert via role=button
//   (the submit CTA) instead of role=heading for the auth card titles.
// - Supabase's hosted signup endpoint counts every signUp() call against the
//   hourly email quota, even with confirmations disabled. Tests that need a
//   pre-existing user therefore provision via the service-role admin API
//   (`createTestUserViaAdmin`) to avoid burning that quota.

test.describe("operator auth flow", () => {
  test("unauthenticated user visiting /dashboard is redirected to login", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
  });

  test("operator can register via the UI and land on the dashboard", async ({
    page,
  }) => {
    const email = generateTestEmail();

    await page.goto("/auth/sign-up");
    await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel("Confirm Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign up" }).click();

    // Race: either dashboard (success) or an error paragraph (rate-limit).
    // Supabase's hosted signup endpoint has an hourly email quota; if we
    // trip it, skip rather than fail the suite.
    const dashboardNav = page
      .waitForURL("**/dashboard", { timeout: 15_000 })
      .then(() => "dashboard" as const);
    const errorShown = page
      .locator("p.text-destructive")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => "error" as const);

    const outcome = await Promise.race([dashboardNav, errorShown]);

    if (outcome === "error") {
      const errorText = (
        await page.locator("p.text-destructive").first().textContent()
      )?.toLowerCase() ?? "";
      test.skip(
        errorText.includes("rate limit") || errorText.includes("too many"),
        `Skipping: Supabase signup rate limit hit — "${errorText}"`,
      );
      throw new Error(`Unexpected signup error: ${errorText}`);
    }

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
  });

  test("registered operator can log in via the UI", async ({ page }) => {
    // Provision the user via service-role admin API so this test does not
    // depend on (or consume) Supabase's signup email quota.
    const email = generateTestEmail();
    await createTestUserViaAdmin(email, TEST_PASSWORD);

    await page.goto("/auth/login");
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Login" }).click();

    await page.waitForURL("**/dashboard", { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
  });

  test("login fails with invalid credentials", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(generateTestEmail());
    await page.getByLabel("Password").fill("wrong-password-value");
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.locator("p.text-destructive").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
