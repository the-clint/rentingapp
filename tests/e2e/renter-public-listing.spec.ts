/**
 * Epic 3 — Renter booking surface (Story 3.1).
 *
 * The renter-facing `/book/[listingId]` page is a purely public surface:
 * anon visitors arriving from a classifieds link must see the listing
 * name, daily rate, pickup location, and description. No auth.
 *
 * We seed a published listing via the service-role admin API, verify the
 * page renders as an anon visitor (new browser context with no cookies),
 * then clean up the listing explicitly so later specs start clean. The
 * operator user itself is reaped by globalTeardown.
 */

import { expect, test } from "@playwright/test";

import {
  cleanupListingsForOperator,
  createOperatorViaAdmin,
  seedListing,
  type SeededOperator,
} from "./helpers/seed";

test.describe("renter public listing page", () => {
  let operator: SeededOperator;

  test.beforeEach(async () => {
    operator = await createOperatorViaAdmin();
  });

  test.afterEach(async () => {
    if (operator) await cleanupListingsForOperator(operator.userId);
  });

  test("anonymous visitor sees a seeded published listing", async ({
    browser,
  }) => {
    const listing = await seedListing(operator.userId, {
      name: `E2E Public Listing ${Date.now()}`,
      description:
        "Public listing description — must be at least twenty characters long for the DB check constraint.",
      dailyRateCents: 7500,
      pickupLocation: "Public Pickup Place, Provo, UT",
    });

    // Fresh context → no auth cookies → exercises the anon RLS path.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`/book/${listing.id}`);
      await expect(
        page.getByRole("heading", { name: listing.name, level: 1 }),
      ).toBeVisible();
      await expect(page.getByText("$75.00")).toBeVisible();
      await expect(page.getByText("Public Pickup Place, Provo, UT")).toBeVisible();
      await expect(
        page.getByText(/public listing description/i),
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("unknown listing id returns a 404", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      // Any well-formed uuid that does not resolve to a published row
      // should collapse to Next's notFound() per `fetchPublicListing`'s
      // contract ("draft / archived / deleted / missing" → 404).
      const response = await page.goto(
        "/book/00000000-0000-0000-0000-000000000000",
      );
      expect(response?.status()).toBe(404);
    } finally {
      await context.close();
    }
  });
});
