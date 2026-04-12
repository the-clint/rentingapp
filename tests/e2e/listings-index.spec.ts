/**
 * Epic 2 — Listing management.
 *   - Story 2.1 (Create Listing wizard entry point)
 *   - Story 2.3 (Listing detail page reachable from grid)
 *   - Story 2.4 (Listings index: empty state + populated grid)
 *
 * Each test provisions its own operator via the service-role admin API so
 * cases run independently. `cleanupListingsForOperator` is called in
 * `afterEach` for tests that seed data; the operator row itself is reaped
 * by globalTeardown via `deleteTestUsers`.
 */

import { expect, test } from "@playwright/test";

import {
  cleanupListingsForOperator,
  createAndLoginOperator,
  seedListing,
  type SeededOperator,
} from "./helpers/seed";

test.describe("operator listings index", () => {
  let operator: SeededOperator;

  test.beforeEach(async ({ page }) => {
    operator = await createAndLoginOperator(page);
  });

  test.afterEach(async () => {
    // Defensive — individual tests may or may not have seeded rows. This
    // call is cheap (single DELETE filtered by operator_id) and makes the
    // spec safe to re-run in isolation.
    if (operator) await cleanupListingsForOperator(operator.userId);
  });

  test("shows empty state for a brand-new operator", async ({ page }) => {
    await page.goto("/listings");

    await expect(
      page.getByRole("heading", { name: "Listings", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: /haven['’]t created any listings yet/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Create Listing" }),
    ).toBeVisible();
  });

  test('"New Listing" button navigates to the wizard', async ({ page }) => {
    await page.goto("/listings");
    await page.getByRole("link", { name: "New Listing" }).click();

    await page.waitForURL("**/listings/new");
    await expect(
      page.getByRole("heading", { name: "New Listing", level: 1 }),
    ).toBeVisible();
    // Wizard renders step 1 — photo upload. Matching on copy only so we
    // don't couple the test to component-level test ids.
    await expect(page.getByText(/photo/i).first()).toBeVisible();
  });

  test("seeded listing appears as a card and links to the detail page", async ({
    page,
  }) => {
    const listing = await seedListing(operator.userId, {
      name: `E2E ${Date.now()} Bobcat`,
      dailyRateCents: 12300,
      pickupLocation: "Sandy, UT",
    });

    await page.goto("/listings");
    const card = page.getByRole("heading", { name: listing.name, level: 2 });
    await expect(card).toBeVisible();
    await expect(page.getByText("$123.00 / day")).toBeVisible();
    await expect(page.getByText("Sandy, UT")).toBeVisible();

    await card.click();
    await page.waitForURL(`**/listings/${listing.id}`);
    await expect(
      page.getByRole("heading", { name: listing.name, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /back to listings/i }),
    ).toBeVisible();
  });
});
