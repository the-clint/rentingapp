/**
 * Epic 1 — Operator shell navigation (Story 1.4).
 *
 * Drives the real sidebar links to each top-level section and confirms the
 * URL + page heading update. Also covers sign-out from the sidebar footer —
 * after signing out an authenticated request to `/dashboard` is redirected
 * back to `/auth/login` by the proxy middleware.
 *
 * No DB seeding beyond the operator itself, so globalTeardown is sufficient
 * for cleanup.
 */

import { expect, test } from "@playwright/test";

import { createAndLoginOperator } from "./helpers/seed";

test.describe("operator navigation shell", () => {
  test("navigates through every sidebar section from the dashboard", async ({
    page,
  }) => {
    await createAndLoginOperator(page);

    // We land on /dashboard after login. Desktop viewport shows the sidebar
    // nav. Use the "Primary" nav landmark so we don't match mobile tab bar
    // duplicates.
    const sidebar = page.getByRole("navigation", { name: "Primary" });
    await expect(sidebar).toBeVisible();

    await sidebar.getByRole("link", { name: "Listings" }).click();
    await page.waitForURL("**/listings");
    await expect(
      page.getByRole("heading", { name: "Listings", level: 1 }),
    ).toBeVisible();

    await sidebar.getByRole("link", { name: "Bookings" }).click();
    await page.waitForURL("**/bookings");
    await expect(
      page.getByRole("heading", { name: "Bookings", level: 1 }),
    ).toBeVisible();

    await sidebar.getByRole("link", { name: "Messages" }).click();
    await page.waitForURL("**/messages");
    await expect(
      page.getByRole("heading", { name: "Messages", level: 1 }),
    ).toBeVisible();

    await sidebar.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL("**/settings");

    await sidebar.getByRole("link", { name: "Dashboard" }).click();
    await page.waitForURL("**/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
  });

  test("sign-out clears the session and blocks dashboard access", async ({
    page,
  }) => {
    await createAndLoginOperator(page);

    const sidebar = page.getByRole("navigation", { name: "Primary" });
    await sidebar.getByRole("button", { name: "Sign out" }).click();

    // After sign out, the proxy redirects unauthenticated /dashboard hits
    // to /auth/login.
    await page.waitForURL(/\/(auth\/login|$)/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
  });
});
