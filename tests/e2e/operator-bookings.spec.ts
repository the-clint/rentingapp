/**
 * Epic 5 — Operator bookings.
 *   - Story 5.1 (Operator bookings view: filter tabs, empty state)
 *   - Story 5.5 (Dashboard home empty state when the operator has zero
 *                listings — uses the shared EmptyListingsCard)
 *
 * These tests only need a fresh operator; no booking rows are seeded (end-
 * to-end booking creation requires Stripe + renter OTP and lives in a
 * future integration layer). Bookings with seeded data are covered in
 * other specs that can mock the dependency edges.
 */

import { expect, test } from "@playwright/test";

import { createAndLoginOperator } from "./helpers/seed";

test.describe("operator bookings + dashboard empty states", () => {
  test("bookings page shows the all-empty state for a new operator", async ({
    page,
  }) => {
    await createAndLoginOperator(page);
    await page.goto("/bookings");

    await expect(
      page.getByRole("heading", { name: "Bookings", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByTestId("operator-bookings-empty-all"),
    ).toBeVisible();
  });

  test("bookings status filters switch the empty-state message and URL", async ({
    page,
  }) => {
    await createAndLoginOperator(page);
    await page.goto("/bookings");

    await page.getByTestId("bookings-filter-active").click();
    await expect(page).toHaveURL(/\/bookings\?status=active/);
    await expect(
      page.getByTestId("operator-bookings-empty-filter"),
    ).toBeVisible();

    await page.getByTestId("bookings-filter-upcoming").click();
    await expect(page).toHaveURL(/\/bookings\?status=upcoming/);
    await expect(
      page.getByTestId("operator-bookings-empty-filter"),
    ).toBeVisible();

    // "Clear filters" link returns to the all-empty view.
    await page.getByRole("link", { name: /clear filters/i }).click();
    await expect(page).toHaveURL(/\/bookings$/);
    await expect(
      page.getByTestId("operator-bookings-empty-all"),
    ).toBeVisible();
  });

  test("dashboard home shows EmptyListingsCard when the operator has zero listings", async ({
    page,
  }) => {
    await createAndLoginOperator(page);
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
    // Dashboard short-circuits to the empty listings CTA before rendering
    // stat cards (Story 5-5 / 1-4 behavior).
    await expect(
      page.getByRole("heading", {
        name: /haven['’]t created any listings yet/i,
      }),
    ).toBeVisible();
  });
});
