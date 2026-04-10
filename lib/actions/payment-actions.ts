"use server";

/**
 * Payment Server Actions (Story 3-5).
 *
 * Two exports:
 *
 * - `createBookingHold(bookingId)` — called from the payment page server
 *   component. Validates the caller owns a `pending_payment` booking,
 *   recomputes the total from the listing's daily_rate_cents (NEVER
 *   trusting the client), creates a Stripe PaymentIntent with
 *   `capture_method: 'manual'`, stores the PaymentIntent id on the
 *   booking row, and returns the client_secret + publishable key for
 *   the client `<Elements>` provider.
 *
 * - `confirmBookingAfterPayment(bookingId)` — called by the client
 *   `PaymentHoldForm` after `stripe.confirmPayment` succeeds. Calls the
 *   `rpc_confirm_booking` Postgres function (transactional: inserts
 *   booking_dates, inserts the maintenance buffer, flips status to
 *   confirmed, all in one atomic unit). On `BOOKING_CONFLICT` it also
 *   cancels the Stripe PaymentIntent so the renter is not left with an
 *   orphaned hold, then returns the error.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelPaymentIntent,
  createBookingHoldIntent,
} from "@/lib/services/stripe";
import { sendBookingConfirmationSms } from "@/lib/services/notifications";
import { enumerateDateRange } from "@/lib/utils/date-range";
import { ok, err, type Result } from "@/lib/utils/result";

export type PaymentError =
  | { code: "PAYMENT_UNAUTHENTICATED"; message: string }
  | { code: "SESSION_EXPIRED"; message: string }
  | { code: "PAYMENT_FORBIDDEN"; message: string }
  | { code: "PAYMENT_BOOKING_NOT_FOUND"; message: string }
  | { code: "PAYMENT_INVALID_STATUS"; message: string }
  | { code: "PAYMENT_LISTING_NOT_FOUND"; message: string }
  | { code: "PAYMENT_MISSING_PUBLISHABLE_KEY"; message: string }
  | { code: "PAYMENT_STRIPE_ERROR"; message: string }
  | { code: "BOOKING_CONFLICT"; message: string }
  | { code: "PAYMENT_DATABASE_ERROR"; message: string };

export interface CreateBookingHoldResult {
  bookingId: string;
  clientSecret: string;
  paymentIntentId: string;
  amountCents: number;
  publishableKey: string;
  listingName: string;
  startDate: string;
  endDate: string;
}

export interface ConfirmBookingAfterPaymentResult {
  bookingId: string;
  listingId: string;
  redirectTo: string;
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

interface BookingForPayment {
  id: string;
  listing_id: string;
  renter_id: string;
  status: string;
  start_date: string;
  end_date: string;
  total_cents: number;
  stripe_payment_intent_id: string | null;
}

interface ListingForPayment {
  id: string;
  name: string;
  daily_rate_cents: number;
  status: "draft" | "published" | "archived";
  deleted_at: string | null;
}

/**
 * Create (or reuse) a Stripe PaymentIntent for a `pending_payment`
 * booking. Idempotent on refresh: if the booking already carries a
 * PaymentIntent id the caller gets back the existing client_secret
 * instead of a brand-new intent.
 */
export async function createBookingHold(
  bookingId: string,
): Promise<Result<CreateBookingHoldResult>> {
  if (!bookingId || typeof bookingId !== "string") {
    return err("PAYMENT_BOOKING_NOT_FOUND", "Missing booking id");
  }

  const session = await getRenterSession();
  if (!session) {
    return err(
      "PAYMENT_UNAUTHENTICATED",
      "You must verify your phone to authorize a payment hold",
    );
  }

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return err(
      "PAYMENT_MISSING_PUBLISHABLE_KEY",
      "Stripe publishable key is not configured",
    );
  }

  const admin = createAdminClient();

  const { data: bookingData, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, listing_id, renter_id, status, start_date, end_date, total_cents, stripe_payment_intent_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    return err(
      "PAYMENT_DATABASE_ERROR",
      bookingError.message ?? "Failed to load booking",
    );
  }
  if (!bookingData) {
    return err("PAYMENT_BOOKING_NOT_FOUND", "Booking not found");
  }
  const booking = bookingData as BookingForPayment;

  if (booking.renter_id !== session.userId) {
    return err(
      "PAYMENT_FORBIDDEN",
      "You do not have permission to pay for this booking",
    );
  }

  if (booking.status !== "pending_payment") {
    return err(
      "PAYMENT_INVALID_STATUS",
      `Booking is not awaiting payment (status: ${booking.status})`,
    );
  }

  // Re-compute total server-side from the authoritative daily rate.
  // Never trust the stored total_cents on its own — the listing could
  // have been edited between contract sign and payment.
  const { data: listingData, error: listingError } = await admin
    .from("listings")
    .select("id, name, daily_rate_cents, status, deleted_at")
    .eq("id", booking.listing_id)
    .maybeSingle();

  if (listingError) {
    return err(
      "PAYMENT_DATABASE_ERROR",
      listingError.message ?? "Failed to load listing",
    );
  }
  if (!listingData) {
    return err("PAYMENT_LISTING_NOT_FOUND", "Listing not found");
  }
  const listing = listingData as ListingForPayment;
  if (listing.deleted_at || listing.status !== "published") {
    return err(
      "PAYMENT_LISTING_NOT_FOUND",
      "This listing is no longer available",
    );
  }

  const rentalDays = enumerateDateRange(
    booking.start_date,
    booking.end_date,
  ).length;
  const recomputedCents = listing.daily_rate_cents * rentalDays;

  // Reuse an existing PaymentIntent on refresh. The Stripe intent is
  // idempotent by its own id — we just fetch the client_secret back.
  if (booking.stripe_payment_intent_id) {
    // Create a brand-new intent only if the total has drifted
    // (shouldn't happen, but cheap check). Otherwise rely on the
    // persisted id.
    try {
      const { getStripeServerClient } = await import("@/lib/services/stripe");
      const stripe = getStripeServerClient();
      const existing = await stripe.paymentIntents.retrieve(
        booking.stripe_payment_intent_id,
      );
      if (
        existing.client_secret &&
        existing.amount === recomputedCents &&
        (existing.status === "requires_payment_method" ||
          existing.status === "requires_confirmation" ||
          existing.status === "requires_action")
      ) {
        return ok({
          bookingId: booking.id,
          clientSecret: existing.client_secret,
          paymentIntentId: existing.id,
          amountCents: recomputedCents,
          publishableKey,
          listingName: listing.name,
          startDate: booking.start_date,
          endDate: booking.end_date,
        });
      }
    } catch {
      // Fall through to create a new intent.
    }
  }

  let created: { clientSecret: string; paymentIntentId: string };
  try {
    created = await createBookingHoldIntent({
      bookingId: booking.id,
      amountCents: recomputedCents,
      metadata: {
        listing_id: booking.listing_id,
        renter_id: session.userId,
      },
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Stripe PaymentIntent creation failed";
    return err("PAYMENT_STRIPE_ERROR", message);
  }

  // Persist the new PaymentIntent id + the recomputed total on the
  // booking row. If this write fails we try to cancel the orphan intent
  // so the renter is not left with a hold we can't track.
  const { error: updateError } = await admin
    .from("bookings")
    .update({
      stripe_payment_intent_id: created.paymentIntentId,
      total_cents: recomputedCents,
    })
    .eq("id", booking.id);

  if (updateError) {
    try {
      await cancelPaymentIntent(created.paymentIntentId);
    } catch {
      // Nothing more we can do — log at Stripe dashboard level.
    }
    return err(
      "PAYMENT_DATABASE_ERROR",
      updateError.message ?? "Failed to store PaymentIntent on booking",
    );
  }

  return ok({
    bookingId: booking.id,
    clientSecret: created.clientSecret,
    paymentIntentId: created.paymentIntentId,
    amountCents: recomputedCents,
    publishableKey,
    listingName: listing.name,
    startDate: booking.start_date,
    endDate: booking.end_date,
  });
}

/**
 * Confirm a booking after Stripe has authorized the hold. Invokes the
 * `rpc_confirm_booking` transactional RPC. On BOOKING_CONFLICT we also
 * cancel the PaymentIntent so the renter isn't stuck with a dead hold.
 */
export async function confirmBookingAfterPayment(
  bookingId: string,
): Promise<Result<ConfirmBookingAfterPaymentResult>> {
  if (!bookingId || typeof bookingId !== "string") {
    return err("PAYMENT_BOOKING_NOT_FOUND", "Missing booking id");
  }

  const session = await getRenterSession();
  if (!session) {
    // Story 3-6: the PaymentHoldForm client entered this action from
    // a page that required a session. Losing it here means the
    // Supabase cookie expired while the renter was on the Stripe
    // Elements screen. Return a distinct code the client can map to
    // a /verify?returnTo=... bounce.
    return err(
      "SESSION_EXPIRED",
      "Your session expired. Please re-verify your phone to continue.",
    );
  }

  const admin = createAdminClient();

  const { data: bookingData, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, listing_id, renter_id, status, start_date, end_date, total_cents, stripe_payment_intent_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    return err(
      "PAYMENT_DATABASE_ERROR",
      bookingError.message ?? "Failed to load booking",
    );
  }
  if (!bookingData) {
    return err("PAYMENT_BOOKING_NOT_FOUND", "Booking not found");
  }
  const booking = bookingData as BookingForPayment;

  if (booking.renter_id !== session.userId) {
    return err(
      "PAYMENT_FORBIDDEN",
      "You do not have permission to confirm this booking",
    );
  }

  // Idempotency: if the booking is already confirmed, treat it as a
  // success so a client retry after an in-flight confirm doesn't error.
  if (booking.status === "confirmed") {
    return ok({
      bookingId: booking.id,
      listingId: booking.listing_id,
      redirectTo: `/book/${booking.listing_id}/confirmed?bookingId=${booking.id}`,
    });
  }

  if (booking.status !== "pending_payment") {
    return err(
      "PAYMENT_INVALID_STATUS",
      `Booking is not awaiting payment (status: ${booking.status})`,
    );
  }

  if (!booking.stripe_payment_intent_id) {
    return err(
      "PAYMENT_INVALID_STATUS",
      "Booking has no Stripe PaymentIntent — create a hold first",
    );
  }

  const { error: rpcError } = await admin.rpc("rpc_confirm_booking", {
    booking_id: booking.id,
    payment_intent_id: booking.stripe_payment_intent_id,
    buffer_days: 5,
  });

  if (rpcError) {
    const raw = rpcError.message ?? "";
    if (raw.includes("BOOKING_CONFLICT")) {
      // Release the hold so the renter isn't charged for a race loss.
      try {
        await cancelPaymentIntent(booking.stripe_payment_intent_id);
      } catch {
        // Swallow — the user-facing error is the conflict.
      }
      return err(
        "BOOKING_CONFLICT",
        "Sorry, these dates were just booked. Please select different dates.",
      );
    }
    if (raw.includes("BOOKING_INVALID_STATUS")) {
      return err(
        "PAYMENT_INVALID_STATUS",
        "Booking is not in a state where it can be confirmed",
      );
    }
    if (raw.includes("BOOKING_NOT_FOUND")) {
      return err("PAYMENT_BOOKING_NOT_FOUND", "Booking not found");
    }
    return err(
      "PAYMENT_DATABASE_ERROR",
      raw || "Failed to confirm booking",
    );
  }

  // Fire-and-forget the stub SMS (TODO: Story 6-4).
  try {
    await sendBookingConfirmationSms({
      phone: session.phoneE164,
      body: `Your rental is confirmed for ${booking.start_date} to ${booking.end_date}. Manage at /rentals.`,
    });
  } catch {
    // Notifications must never roll back a successful confirmation.
  }

  return ok({
    bookingId: booking.id,
    listingId: booking.listing_id,
    redirectTo: `/book/${booking.listing_id}/confirmed?bookingId=${booking.id}`,
  });
}
