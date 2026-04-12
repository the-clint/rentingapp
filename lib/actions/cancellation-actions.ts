"use server";

/**
 * Cancellation Server Actions (Story 4-3).
 *
 * Two exports:
 *
 * - `previewCancellation(bookingId)` — read-only. Validates the caller
 *   owns a confirmed, upcoming booking, computes `hours_until_start`
 *   from the booking's `start_date` (treated as midnight UTC — same
 *   convention as every other date column in this app), and returns
 *   the outcome the renter will see if they confirm RIGHT NOW.
 *
 *     outcome === 'refund'        when hours_until_start >= 48
 *     outcome === 'hold_captured' when hours_until_start <  48
 *
 *   The page renders a different confirmation message per outcome —
 *   see `components/rentals/cancel-booking-flow.tsx`.
 *
 * - `confirmCancellation(bookingId, { acknowledgedOutcome })` — the
 *   write path. Re-runs preview and:
 *     1. If the RECOMPUTED outcome differs from
 *        `acknowledgedOutcome`, returns `OUTCOME_DRIFT`. The client
 *        surfaces this as "refresh to see the updated policy" rather
 *        than silently charging the renter a surprise fee (or silently
 *        refunding them when policy said no refund). This matters if
 *        the renter sat on the page for an hour and crossed the 48h
 *        boundary.
 *     2. Runs the Stripe side-effect FIRST — cancel (refund outcome)
 *        or capture (hold_captured outcome). Any extension intent is
 *        unwound the same way (releases on refund, captures on
 *        hold_captured).
 *     3. Calls `rpc_cancel_booking(bookingId, dbOutcome)` to free the
 *        calendar + maintenance buffer + stamp audit columns. On an
 *        RPC error AFTER a successful Stripe call, we log prominently
 *        and return `CANCELLATION_DATABASE_ERROR` — the caller's retry
 *        path will re-cancel (idempotent) and re-run the RPC.
 *     4. Fires the SMS stub, never blocks success on it.
 *
 * Ordering decision — Stripe FIRST, RPC SECOND:
 *   - Stripe's `paymentIntents.cancel` + `paymentIntents.capture` are
 *     idempotent at the service level (both swallow
 *     StripeInvalidRequestError on "already cancelled / captured"),
 *     so a second pass is safe.
 *   - The RPC mutation is expensive to reverse: if we ran the RPC
 *     first and Stripe then failed, the booking_dates would be gone
 *     (freed for another booking) but the hold would still be live —
 *     and if a new booking raced in to grab those dates, re-inserting
 *     the old rows would conflict with the unique constraint. Running
 *     Stripe first means the worst case is "hold is released / captured
 *     but dates still reserved" — the renter can retry and the RPC
 *     short-circuits via its own idempotency branch (already-cancelled
 *     → no-op RETURN).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelExtensionIntent,
  cancelPaymentIntent,
  capturePaymentIntent,
} from "@/lib/services/stripe";
import { sendBookingCancellationSms } from "@/lib/services/notifications";
import {
  computeHoursUntilStart,
  outcomeFromHours,
  type CancellationError,
  type ConfirmCancellationInput,
  type ConfirmCancellationResult,
  type PreviewCancellationResult,
} from "@/lib/services/cancellation-policy";
import { computeRentalLifecycle } from "@/lib/services/rental-lifecycle";
import { createClient } from "@/lib/supabase/server";
import { err, ok, type Result } from "@/lib/utils/result";

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

interface BookingForCancellation {
  id: string;
  listing_id: string;
  renter_id: string;
  status: string;
  start_date: string;
  end_date: string;
  total_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_extension_intent_id: string | null;
}

async function loadBookingForCancellation(
  bookingId: string,
  session: RenterSession,
): Promise<
  | { ok: true; booking: BookingForCancellation; listingName: string }
  | { ok: false; error: CancellationError }
> {
  const admin = createAdminClient();
  const { data: bookingRow, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, listing_id, renter_id, status, start_date, end_date, total_cents, stripe_payment_intent_id, stripe_extension_intent_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    return {
      ok: false,
      error: {
        code: "CANCELLATION_DATABASE_ERROR",
        message: bookingError.message ?? "Failed to load booking",
      },
    };
  }
  if (!bookingRow) {
    return {
      ok: false,
      error: {
        code: "CANCELLATION_BOOKING_NOT_FOUND",
        message: "Booking not found",
      },
    };
  }
  const booking = bookingRow as BookingForCancellation;

  if (booking.renter_id !== session.userId) {
    return {
      ok: false,
      error: {
        code: "CANCELLATION_FORBIDDEN",
        message: "You do not have permission to cancel this booking",
      },
    };
  }

  if (booking.status === "cancelled") {
    return {
      ok: false,
      error: {
        code: "CANCELLATION_ALREADY_CANCELLED",
        message: "This booking has already been cancelled.",
      },
    };
  }

  if (booking.status !== "confirmed") {
    return {
      ok: false,
      error: {
        code: "CANCELLATION_NOT_ELIGIBLE",
        message: "This booking is not eligible for cancellation.",
      },
    };
  }

  // Lifecycle gate — only `upcoming` bookings can be cancelled by the
  // renter. `active` / `return_due` / `completed` / `cancelled` / the
  // 45-day past window all reject here.
  const lifecycle = computeRentalLifecycle(
    {
      status: "confirmed",
      startDate: booking.start_date,
      endDate: booking.end_date,
    },
    new Date(),
  );
  if (lifecycle.state !== "upcoming") {
    return {
      ok: false,
      error: {
        code: "CANCELLATION_NOT_ELIGIBLE",
        message:
          "This rental is already in progress or has ended — cancellation is not available.",
      },
    };
  }

  const { data: listingRow, error: listingError } = await admin
    .from("listings")
    .select("id, name")
    .eq("id", booking.listing_id)
    .maybeSingle();

  if (listingError) {
    return {
      ok: false,
      error: {
        code: "CANCELLATION_DATABASE_ERROR",
        message: listingError.message ?? "Failed to load listing",
      },
    };
  }
  const listingName =
    (listingRow as { name?: string } | null)?.name ?? "Rental";

  return { ok: true, booking, listingName };
}

/**
 * Read-only preview. Called by the cancel page Server Component to
 * render the correct copy BEFORE the renter confirms.
 */
export async function previewCancellation(
  bookingId: string,
): Promise<Result<PreviewCancellationResult>> {
  if (!bookingId || typeof bookingId !== "string") {
    return err(
      "CANCELLATION_BOOKING_NOT_FOUND",
      "Missing booking id",
    ) as Result<PreviewCancellationResult>;
  }

  const session = await getRenterSession();
  if (!session) {
    return err(
      "CANCELLATION_UNAUTHENTICATED",
      "You must verify your phone to cancel a rental",
    ) as Result<PreviewCancellationResult>;
  }

  const loaded = await loadBookingForCancellation(bookingId, session);
  if (!loaded.ok) {
    return err(
      loaded.error.code,
      loaded.error.message,
    ) as Result<PreviewCancellationResult>;
  }
  const { booking, listingName } = loaded;

  const hoursUntilStart = computeHoursUntilStart(
    booking.start_date,
    new Date(),
  );
  const outcome = outcomeFromHours(hoursUntilStart);

  return ok({
    bookingId: booking.id,
    outcome,
    hoursUntilStart,
    amountCents: booking.total_cents,
    listingName,
    startDate: booking.start_date,
    endDate: booking.end_date,
  });
}

/**
 * Commit the cancellation. See the module header for ordering rationale.
 */
export async function confirmCancellation(
  bookingId: string,
  input: ConfirmCancellationInput,
): Promise<Result<ConfirmCancellationResult>> {
  if (!bookingId || typeof bookingId !== "string") {
    return err(
      "CANCELLATION_BOOKING_NOT_FOUND",
      "Missing booking id",
    ) as Result<ConfirmCancellationResult>;
  }
  if (
    input.acknowledgedOutcome !== "refund" &&
    input.acknowledgedOutcome !== "hold_captured"
  ) {
    return err(
      "OUTCOME_DRIFT",
      "The cancellation policy changed. Please refresh and try again.",
    ) as Result<ConfirmCancellationResult>;
  }

  const session = await getRenterSession();
  if (!session) {
    return err(
      "SESSION_EXPIRED",
      "Your session expired. Please re-verify your phone to continue.",
    ) as Result<ConfirmCancellationResult>;
  }

  const loaded = await loadBookingForCancellation(bookingId, session);
  if (!loaded.ok) {
    return err(
      loaded.error.code,
      loaded.error.message,
    ) as Result<ConfirmCancellationResult>;
  }
  const { booking } = loaded;

  const hoursUntilStart = computeHoursUntilStart(
    booking.start_date,
    new Date(),
  );
  const currentOutcome = outcomeFromHours(hoursUntilStart);

  if (currentOutcome !== input.acknowledgedOutcome) {
    return err(
      "OUTCOME_DRIFT",
      "The cancellation policy changed while you were on this page. Refresh to see the updated policy.",
    ) as Result<ConfirmCancellationResult>;
  }

  // ----- Stripe side-effect (ordering: FIRST) -----
  const dbOutcome: "refunded" | "hold_captured" =
    currentOutcome === "refund" ? "refunded" : "hold_captured";

  try {
    if (currentOutcome === "refund") {
      if (booking.stripe_payment_intent_id) {
        await cancelPaymentIntent(booking.stripe_payment_intent_id);
      }
      if (booking.stripe_extension_intent_id) {
        await cancelExtensionIntent(booking.stripe_extension_intent_id);
      }
    } else {
      if (booking.stripe_payment_intent_id) {
        await capturePaymentIntent(booking.stripe_payment_intent_id);
      }
      if (booking.stripe_extension_intent_id) {
        await capturePaymentIntent(booking.stripe_extension_intent_id);
      }
    }
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Stripe cancellation call failed";
    return err(
      "CANCELLATION_STRIPE_ERROR",
      message,
    ) as Result<ConfirmCancellationResult>;
  }

  // ----- DB mutation (ordering: SECOND) -----
  const admin = createAdminClient();
  const { error: rpcError } = await admin.rpc("rpc_cancel_booking", {
    booking_id: booking.id,
    cancellation_outcome: dbOutcome,
  });

  if (rpcError) {
    const raw = rpcError.message ?? "";
    // Idempotency + drift: if the DB says the booking isn't eligible
    // (e.g. it transitioned under us), still report a precise code so
    // the UI can recover.
    if (raw.includes("CANCELLATION_NOT_FOUND")) {
      return err(
        "CANCELLATION_BOOKING_NOT_FOUND",
        "Booking not found",
      ) as Result<ConfirmCancellationResult>;
    }
    if (raw.includes("CANCELLATION_NOT_ELIGIBLE")) {
      return err(
        "CANCELLATION_NOT_ELIGIBLE",
        "This booking is no longer eligible for cancellation",
      ) as Result<ConfirmCancellationResult>;
    }
    // Log loudly — Stripe side already fired, so the renter sees an
    // error but the hold has already been released/captured. The RPC
    // is idempotent, so a retry will succeed.
    console.error(
      "[cancellation] RPC failed AFTER successful Stripe side-effect — booking dates still reserved",
      JSON.stringify({
        bookingId: booking.id,
        outcome: currentOutcome,
        rpcError: raw,
      }),
    );
    return err(
      "CANCELLATION_DATABASE_ERROR",
      raw || "Failed to cancel booking",
    ) as Result<ConfirmCancellationResult>;
  }

  // Fire-and-forget the stub SMS (TODO: Story 6-4). Never blocks or
  // rolls back a successful cancellation.
  try {
    await sendBookingCancellationSms({
      phone: session.phoneE164,
      outcome: currentOutcome,
    });
  } catch {
    // Swallow — notifications must never undo a successful cancellation.
  }

  return ok({
    bookingId: booking.id,
    outcome: currentOutcome,
    newStatus: "cancelled",
  });
}
