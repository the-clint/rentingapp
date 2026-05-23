/**
 * Shared seeding + cleanup helpers for Playwright e2e tests.
 *
 * Design goals:
 *  - Every test that needs DB state creates its own test-scoped operator via
 *    the service-role admin API. globalTeardown deletes all e2e-prefixed users
 *    at the end of the run, and every public.* row tied to that user is
 *    removed via ON DELETE CASCADE from auth.users → profiles → listings →
 *    bookings → booking_dates → ... so we never leak rows.
 *  - Individual specs can also call `cleanupListings` / `cleanupOperator`
 *    explicitly in `afterEach` when they want the DB clean mid-run.
 *  - Helpers favor direct service-role inserts over driving multi-step UI
 *    wizards — we're testing the UI surfaces here, not the wizard's full
 *    happy path (which has its own vitest component coverage).
 */

import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createAdminClient,
  createTestUserViaAdmin,
  generateTestEmail,
  TEST_PASSWORD,
} from "./test-user";

export interface SeededOperator {
  email: string;
  password: string;
  userId: string;
}

/**
 * Create a brand-new operator via the service-role admin API.
 *
 * Returns credentials + the auth user id. The profile row (with
 * `role = 'operator'` by default) is auto-created by the `handle_new_user`
 * trigger in migration 00002.
 */
export async function createOperatorViaAdmin(): Promise<SeededOperator> {
  const email = generateTestEmail();
  await createTestUserViaAdmin(email, TEST_PASSWORD);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) {
    throw new Error(`Failed to look up seeded operator: ${error.message}`);
  }
  const user = data.users.find((u) => u.email === email);
  if (!user) {
    throw new Error(`Seeded operator not found after create: ${email}`);
  }

  return { email, password: TEST_PASSWORD, userId: user.id };
}

/**
 * Log an operator in through the real login UI and wait until the dashboard
 * is visible. The UI flow matches the one exercised by `operator-auth.spec.ts`
 * and goes through the proxy middleware, so any regression in the auth path
 * will surface here too.
 */
export async function loginOperator(
  page: Page,
  operator: SeededOperator,
): Promise<void> {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(operator.email);
  await page.getByLabel("Password").fill(operator.password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
}

/**
 * Convenience — create a fresh operator and immediately sign them in.
 */
export async function createAndLoginOperator(
  page: Page,
): Promise<SeededOperator> {
  const operator = await createOperatorViaAdmin();
  await loginOperator(page, operator);
  return operator;
}

export interface SeedListingInput {
  name?: string;
  description?: string;
  dailyRateCents?: number;
  pickupLocation?: string;
  pickupInstructions?: string | null;
  status?: "draft" | "published" | "archived";
}

export interface SeededListing {
  id: string;
  name: string;
  dailyRateCents: number;
  pickupLocation: string;
}

const DEFAULT_LISTING: Required<
  Omit<SeedListingInput, "pickupInstructions">
> & { pickupInstructions: string | null } = {
  name: "E2E Seeded Listing",
  description:
    "This is a seeded e2e test listing — safe to delete. Contains at least twenty characters.",
  dailyRateCents: 4500,
  pickupLocation: "Seeded Pickup Location, Salt Lake City, UT",
  pickupInstructions: null,
  status: "published",
};

/**
 * Insert a minimal valid listing row owned by `operatorId`.
 *
 * The photos JSON uses a fake storage path under the owner's prefix. The
 * listings index / detail pages call `getPublicUrl` which is a pure string
 * op — they never require the file to actually exist, the `<img>` tag just
 * 404s silently and the test continues. This keeps seeding synchronous and
 * avoids coupling test setup to Supabase Storage uploads.
 */
export async function seedListing(
  operatorId: string,
  overrides: SeedListingInput = {},
): Promise<SeededListing> {
  const admin = createAdminClient();
  const merged = { ...DEFAULT_LISTING, ...overrides };

  const fakePhoto = {
    path: `${operatorId}/e2e-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.jpg`,
    isHero: true,
    position: 0,
  };

  const { data, error } = await admin
    .from("listings")
    .insert({
      operator_id: operatorId,
      name: merged.name,
      description: merged.description,
      daily_rate_cents: merged.dailyRateCents,
      address_street: "123 Seeded St",
      address_city: "Salt Lake City",
      address_state: "UT",
      address_zip: "84101",
      pickup_location: merged.pickupLocation,
      pickup_instructions: merged.pickupInstructions,
      photos: [fakePhoto],
      status: merged.status,
    })
    .select("id, name, daily_rate_cents, pickup_location")
    .single();

  if (error || !data) {
    throw new Error(
      `seedListing failed: ${error?.message ?? "no row returned"}`,
    );
  }

  return {
    id: data.id as string,
    name: data.name as string,
    dailyRateCents: data.daily_rate_cents as number,
    pickupLocation: data.pickup_location as string,
  };
}

/**
 * Hard-delete every listing owned by a test operator. Called between tests
 * or at the end of a spec so later tests start from a known-clean state
 * without having to wait for globalTeardown.
 */
export async function cleanupListingsForOperator(
  operatorId: string,
): Promise<void> {
  const admin: SupabaseClient = createAdminClient();
  const { error } = await admin
    .from("listings")
    .delete()
    .eq("operator_id", operatorId);
  if (error) {
    throw new Error(`cleanupListingsForOperator failed: ${error.message}`);
  }
}
