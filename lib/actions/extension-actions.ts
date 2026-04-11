"use server";

/**
 * Extension Server Actions (Story 4-2).
 *
 * Two exports:
 *
 * - `prepareExtension(bookingId, extendDays)` — called from the extend
 *   page (step 1 → step 2 transition). Validates the caller owns a
 *   confirmed, eligible booking. Looks up the maintenance buffer row
 *   for the booking and computes `maxExtendDays = buffer_days_total -
 *   1` (reserve 1 mandatory maintenance day). Validates
 *   `1 <= extendDays <= maxExtendDays`. Recomputes the delta amount
 *   server-side from `listings.daily_rate_cents` (NEVER trusts client
 *   input). Creates a new Stripe PaymentIntent for the delta via
 *   `createExtensionHoldIntent`. Stamps the intent id on the booking
 *   row (`stripe_extension_intent_id`) so a commit-step failure can
 *   still cancel the intent. Returns `{ clientSecret, amountCents,
 *   newEndDate, publishableKey }`.
 *
 * - `commitExtension(bookingId)` — called from the client after
 *   `stripe.confirmPayment` has authorized the delta hold. Looks up the
 *   booking, re-reads `stripe_extension_intent_id`, invokes the
 *   `rpc_extend_booking` RPC with the extend_days recomputed from
 *   `new_end_date - old_end_date`... wait — we don't have old dates at
 *   commit time without a second load. Simpler: the client passes
 *   `extendDays`. We re-validate everything before calling the RPC.
 *   On `EXTENSION_CONFLICT`, we cancel the delta intent so the renter
 *   isn't left with an orphaned hold. Fires the SMS stub on success.
 *
 * All errors flow through the `Result<T>` convention with a single
 * `ExtensionError` discriminated union. Mirrors the
 * `payment-actions.ts` pattern from Story 3-5 and the SESSION_EXPIRED
 * branch from Story 3-6.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelExtensionIntent,
  createExtensionHoldIntent,
} from "@/lib/services/stripe";
import { sendBookingExtensionSms } from "@/lib/services/notifications";
import { computeRentalLifecycle } from "@/lib/services/rental-lifecycle";
import { createClient } from "@/lib/supabase/server";
import { err, ok, type Result } from "@/lib/utils/result";

export type ExtensionError =
  | { code: "EXTENSION_UNAUTHENTICATED"; message: string }
  | { code: "SESSION_EXPIRED"; message: string }
  | { code: "EXTENSION_FORBIDDEN"; message: string }
  | { code: "EXTENSION_BOOKING_NOT_FOUND"; message: string }
  | { code: "EXTENSION_NOT_ELIGIBLE"; message: string }
  | { code: "EXTENSION_LIMIT_EXCEEDED"; message: string }
  | { code: "EXTENSION_LISTING_NOT_FOUND"; message: string }
  | { code: "EXTENSION_MISSING_PUBLISHABLE_KEY"; message: string }
  | { code: "EXTENSION_STRIPE_ERROR"; message: string }
  | { code: "EXTENSION_CONFLICT"; message: string }
  | { code: "EXTENSION_DATABASE_ERROR"; message: string };

export interface PrepareExtensionResult {
  bookingId: string;
  clientSecret: string;
  paymentIntentId: string;
  amountCents: number;
  extendDays: number;
  newEndDate: string;
  publishableKey: string;
  listingName: string;
}

export interface CommitExtensionResult {
  bookingId: string;
  listingId: string;
  newEndDate: string;
  newTotalCents: number;
  extendDays: number;
}

interface RenterSession {
  userId: string;
  phoneE164: string;
}

async function getRenterSession(): Promise<RenterSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const phone = user.phone;
  if (!phone) return null;
  const role = (user.app_metadata as { role?: string } | null)?.role;
  if (role && role !== "renter") return null;
  return {
    userId: user.id,
    phoneE164: phone.startsWith("+") ? phone : `+${phone}`,
  };
}

interface BookingForExtension {
  id: string;
  listing_id: string;
  renter_id: string;
  status: string;
  start_date: string;
  end_date: string;
  total_cents: number;
  stripe_extension_intent_id: string | null;
}

interface ListingForExtension {
  id: string;
  name: string;
  daily_rate_cents: number;
  status: "draft" | "published" | "archived";
  deleted_at: string | null;
}

interface BufferRow {
  id: string;
  start_date: string;
  end_date: string;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysInclusive(startIso: string, endIso: string): number {
  const s = new Date(`${startIso}T00:00:00Z`).getTime();
  const e = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.round((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Validate + compute the Stripe delta hold for an extension. Stores
 * the PaymentIntent id on the booking row so commit/cancel are both
 * addressable.
 */
export async function prepareExtension(
  bookingId: string,
  extendDays: number,
): Promise<Result<PrepareExtensionResult>> {
  if (!bookingId || typeof bookingId !== "string") {
    return err(
      "EXTENSION_BOOKING_NOT_FOUND",
      "Missing booking id",
    ) as Result<PrepareExtensionResult>;
  }
  if (!Number.isInteger(extendDays) || extendDays < 1 || extendDays > 4) {
    return err(
      "EXTENSION_LIMIT_EXCEEDED",
      "Extension must be between 1 and 4 days",
    ) as Result<PrepareExtensionResult>;
  }

  const session = await getRenterSession();
  if (!session) {
    return err(
      "EXTENSION_UNAUTHENTICATED",
      "You must verify your phone to extend a rental",
    ) as Result<PrepareExtensionResult>;
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return err(
      "EXTENSION_MISSING_PUBLISHABLE_KEY",
      "Stripe publishable key is not configured",
    ) as Result<PrepareExtensionResult>;
  }

  const admin = createAdminClient();

  const { data: bookingData, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, listing_id, renter_id, status, start_date, end_date, total_cents, stripe_extension_intent_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    return err(
      "EXTENSION_DATABASE_ERROR",
      bookingError.message ?? "Failed to load booking",
    ) as Result<PrepareExtensionResult>;
  }
  if (!bookingData) {
    return err(
      "EXTENSION_BOOKING_NOT_FOUND",
      "Booking not found",
    ) as Result<PrepareExtensionResult>;
  }
  const booking = bookingData as BookingForExtension;

  if (booking.renter_id !== session.userId) {
    return err(
      "EXTENSION_FORBIDDEN",
      "You do not have permission to extend this booking",
    ) as Result<PrepareExtensionResult>;
  }

  // Lifecycle gate — only `active` and `return_due` can extend.
  if (booking.status !== "confirmed") {
    return err(
      "EXTENSION_NOT_ELIGIBLE",
      "This booking is not eligible for extension",
    ) as Result<PrepareExtensionResult>;
  }
  const lifecycle = computeRentalLifecycle(
    {
      status: "confirmed",
      startDate: booking.start_date,
      endDate: booking.end_date,
    },
    new Date(),
  );
  if (
    lifecycle.state !== "active" &&
    lifecycle.state !== "return_due"
  ) {
    return err(
      "EXTENSION_NOT_ELIGIBLE",
      "This rental is not currently active — extensions are only available during or just after a rental",
    ) as Result<PrepareExtensionResult>;
  }

  // Load listing for daily rate + name (server-trusted price).
  const { data: listingData, error: listingError } = await admin
    .from("listings")
    .select("id, name, daily_rate_cents, status, deleted_at")
    .eq("id", booking.listing_id)
    .maybeSingle();
  if (listingError) {
    return err(
      "EXTENSION_DATABASE_ERROR",
      listingError.message ?? "Failed to load listing",
    ) as Result<PrepareExtensionResult>;
  }
  if (!listingData) {
    return err(
      "EXTENSION_LISTING_NOT_FOUND",
      "Listing not found",
    ) as Result<PrepareExtensionResult>;
  }
  const listing = listingData as ListingForExtension;

  // Load the maintenance buffer row for this booking.
  const bufferEndCandidate = addDaysIso(booking.end_date, 5);
  const bufferStartCandidate = addDaysIso(booking.end_date, 1);
  const { data: bufferRows, error: bufferError } = await admin
    .from("listing_blocked_dates")
    .select("id, start_date, end_date")
    .eq("listing_id", booking.listing_id)
    .eq("reason", "maintenance_buffer")
    .lte("start_date", bufferEndCandidate)
    .gte("end_date", bufferStartCandidate);

  if (bufferError) {
    return err(
      "EXTENSION_DATABASE_ERROR",
      bufferError.message ?? "Failed to load maintenance buffer",
    ) as Result<PrepareExtensionResult>;
  }
  const buffer: BufferRow | undefined = (bufferRows ?? [])[0] as
    | BufferRow
    | undefined;
  if (!buffer) {
    return err(
      "EXTENSION_NOT_ELIGIBLE",
      "No maintenance buffer remains for this rental",
    ) as Result<PrepareExtensionResult>;
  }

  const bufferDaysTotal = daysInclusive(
    buffer.start_date,
    buffer.end_date,
  );
  const maxExtendDays = Math.min(4, bufferDaysTotal - 1);
  if (maxExtendDays < 1) {
    return err(
      "EXTENSION_LIMIT_EXCEEDED",
      "No extension capacity remains for this rental",
    ) as Result<PrepareExtensionResult>;
  }
  if (extendDays > maxExtendDays) {
    return err(
      "EXTENSION_LIMIT_EXCEEDED",
      `You can extend this rental by at most ${maxExtendDays} day(s)`,
    ) as Result<PrepareExtensionResult>;
  }

  const deltaCents = listing.daily_rate_cents * extendDays;
  if (deltaCents <= 0) {
    return err(
      "EXTENSION_DATABASE_ERROR",
      "Invalid delta amount computed",
    ) as Result<PrepareExtensionResult>;
  }

  let created: { clientSecret: string; paymentIntentId: string };
  try {
    created = await createExtensionHoldIntent({
      bookingId: booking.id,
      amountCents: deltaCents,
      metadata: {
        listing_id: booking.listing_id,
        renter_id: session.userId,
        extend_days: String(extendDays),
      },
    });
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : "Stripe PaymentIntent creation failed";
    return err(
      "EXTENSION_STRIPE_ERROR",
      message,
    ) as Result<PrepareExtensionResult>;
  }

  const { error: updateError } = await admin
    .from("bookings")
    .update({ stripe_extension_intent_id: created.paymentIntentId })
    .eq("id", booking.id);

  if (updateError) {
    try {
      await cancelExtensionIntent(created.paymentIntentId);
    } catch {
      // Nothing more we can do — orphan will age out of Stripe.
    }
    return err(
      "EXTENSION_DATABASE_ERROR",
      updateError.message ?? "Failed to store PaymentIntent on booking",
    ) as Result<PrepareExtensionResult>;
  }

  const newEndDate = addDaysIso(booking.end_date, extendDays);

  return ok({
    bookingId: booking.id,
    clientSecret: created.clientSecret,
    paymentIntentId: created.paymentIntentId,
    amountCents: deltaCents,
    extendDays,
    newEndDate,
    publishableKey,
    listingName: listing.name,
  });
}

export interface CommitExtensionInput {
  bookingId: string;
  extendDays: number;
}

/**
 * Commit a previously-prepared extension. Invokes the
 * `rpc_extend_booking` RPC, which is transactional: the booking_dates
 * insert, listing_blocked_dates shrink, and booking row update all
 * succeed or all fail. On `EXTENSION_CONFLICT` we cancel the Stripe
 * delta hold so the renter isn't stuck with a dead hold.
 */
export async function commitExtension(
  input: CommitExtensionInput,
): Promise<Result<CommitExtensionResult>> {
  const { bookingId, extendDays } = input;
  if (!bookingId || typeof bookingId !== "string") {
    return err(
      "EXTENSION_BOOKING_NOT_FOUND",
      "Missing booking id",
    ) as Result<CommitExtensionResult>;
  }
  if (!Number.isInteger(extendDays) || extendDays < 1 || extendDays > 4) {
    return err(
      "EXTENSION_LIMIT_EXCEEDED",
      "Extension must be between 1 and 4 days",
    ) as Result<CommitExtensionResult>;
  }

  const session = await getRenterSession();
  if (!session) {
    return err(
      "SESSION_EXPIRED",
      "Your session expired. Please re-verify your phone to continue.",
    ) as Result<CommitExtensionResult>;
  }

  const admin = createAdminClient();

  const { data: bookingData, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, listing_id, renter_id, status, start_date, end_date, total_cents, stripe_extension_intent_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    return err(
      "EXTENSION_DATABASE_ERROR",
      bookingError.message ?? "Failed to load booking",
    ) as Result<CommitExtensionResult>;
  }
  if (!bookingData) {
    return err(
      "EXTENSION_BOOKING_NOT_FOUND",
      "Booking not found",
    ) as Result<CommitExtensionResult>;
  }
  const booking = bookingData as BookingForExtension;

  if (booking.renter_id !== session.userId) {
    return err(
      "EXTENSION_FORBIDDEN",
      "You do not have permission to extend this booking",
    ) as Result<CommitExtensionResult>;
  }

  if (booking.status !== "confirmed") {
    return err(
      "EXTENSION_NOT_ELIGIBLE",
      "This booking is not eligible for extension",
    ) as Result<CommitExtensionResult>;
  }

  if (!booking.stripe_extension_intent_id) {
    return err(
      "EXTENSION_NOT_ELIGIBLE",
      "No extension hold is on file — please restart the extension flow",
    ) as Result<CommitExtensionResult>;
  }

  const { error: rpcError } = await admin.rpc("rpc_extend_booking", {
    booking_id: booking.id,
    extend_days: extendDays,
    payment_intent_id: booking.stripe_extension_intent_id,
  });

  if (rpcError) {
    const raw = rpcError.message ?? "";
    if (raw.includes("EXTENSION_CONFLICT")) {
      try {
        await cancelExtensionIntent(booking.stripe_extension_intent_id);
      } catch {
        // Swallow — the user-facing error is the conflict.
      }
      return err(
        "EXTENSION_CONFLICT",
        "Those dates were just booked. Please try a shorter extension.",
      ) as Result<CommitExtensionResult>;
    }
    if (raw.includes("EXTENSION_LIMIT_EXCEEDED")) {
      return err(
        "EXTENSION_LIMIT_EXCEEDED",
        "Extension exceeds the remaining buffer window",
      ) as Result<CommitExtensionResult>;
    }
    if (raw.includes("EXTENSION_NOT_FOUND")) {
      return err(
        "EXTENSION_BOOKING_NOT_FOUND",
        "Booking not found",
      ) as Result<CommitExtensionResult>;
    }
    if (raw.includes("EXTENSION_NOT_ELIGIBLE")) {
      return err(
        "EXTENSION_NOT_ELIGIBLE",
        "This booking is no longer eligible for extension",
      ) as Result<CommitExtensionResult>;
    }
    return err(
      "EXTENSION_DATABASE_ERROR",
      raw || "Failed to extend booking",
    ) as Result<CommitExtensionResult>;
  }

  const newEndDate = addDaysIso(booking.end_date, extendDays);

  // Compute the new total from the cached booking row + a single
  // listing lookup for the daily rate. (The RPC has already persisted
  // the authoritative value; we just surface it for the success UI.)
  const { data: listingRow } = await admin
    .from("listings")
    .select("daily_rate_cents")
    .eq("id", booking.listing_id)
    .maybeSingle();
  const dailyRate = (listingRow as { daily_rate_cents: number } | null)
    ?.daily_rate_cents ?? 0;
  const newTotalCents = booking.total_cents + dailyRate * extendDays;

  // Fire-and-forget the stub SMS (TODO: Story 6-4). Never blocks or
  // rolls back a successful extension.
  try {
    await sendBookingExtensionSms({
      phone: session.phoneE164,
      body: `Your rental has been extended by ${extendDays} day(s). New return: ${newEndDate}. Manage at /rentals.`,
    });
  } catch {
    // Swallow — notifications must never undo a successful extension.
  }

  return ok({
    bookingId: booking.id,
    listingId: booking.listing_id,
    newEndDate,
    newTotalCents,
    extendDays,
  });
}
