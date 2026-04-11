/**
 * Epic 6 — Operator message hub (Story 6.2).
 *
 * End-to-end SMS messaging requires a Twilio webhook round-trip which is
 * out of scope for a local e2e run. This spec covers the surface the
 * operator sees BEFORE any inbound SMS lands: a fresh operator opening
 * the hub should see the explicit "messages-empty-state" panel rather
 * than an error or a skeleton.
 */

import { expect, test } from "@playwright/test";

import { createAndLoginOperator } from "./helpers/seed";

test.describe("operator message hub", () => {
  test("new operator sees the empty state on /messages", async ({ page }) => {
    await createAndLoginOperator(page);
    await page.goto("/messages");

    await expect(
      page.getByRole("heading", { name: "Messages", level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("messages-empty-state")).toBeVisible();
  });
});
