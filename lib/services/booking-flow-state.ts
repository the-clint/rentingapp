/**
 * Booking flow state resolver (Story 3-6).
 *
 * Computes the "most advanced" booking-flow step the renter already has
 * durable state for, given a `(renterId, listingId, startDate, endDate)`
 * tuple. Used by the renter step pages to short-circuit refresh and
 * return-visits so a renter who, e.g., already signed a contract and
 * closed the tab lands directly on the payment step instead of the
 * calendar.
 *
 * Resolution order (most advanced wins):
 *
 *   1. `bookings` row in `confirmed` → step `'confirmed'`.
 *   2. `bookings` row in `pending_payment` → step `'payment'`.
 *   3. `contracts` row with `signed_at IS NULL` → step `'contract'`.
 *   4. Otherwise → step `'listing'` (nothing persisted).
 *
 * The caller supplies `renterId` — the renter session gate is enforced
 * upstream. This helper does ownership checks regardless: every SELECT
 * is scoped to `renter_id = input.renterId`, so a forged URL with
 * someone else's dates cannot resolve past `'listing'`.
 *
 * Implementation uses the service-role admin client so the rows are
 * readable without depending on RLS — the same pattern the contract
 * and payment actions already use.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { ok, err, type Result } from "@/lib/utils/result";

export type BookingFlowStep =
  | "listing"
  | "verify"
  | "contract"
  | "payment"
  | "confirmed";

export interface BookingFlowResumeInput {
  renterId: string;
  listingId: string;
  startDate: string;
  endDate: string;
}

export interface BookingFlowResumePoint {
  step: BookingFlowStep;
  bookingId?: string;
  contractId?: string;
}

export type BookingFlowStateError = {
  code: "BOOKING_FLOW_STATE_DATABASE_ERROR";
  message: string;
};

// Statuses that mean the renter has an in-flight or completed booking
// for this listing + date range. Cancelled bookings are ignored so the
// renter can re-book the same dates fresh.
const LIVE_BOOKING_STATUSES = ["confirmed", "pending_payment"] as const;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Returns the resume point for the renter's booking flow. Never throws —
 * database failures are surfaced via the `Result` error channel.
 */
export async function getBookingFlowResumePoint(
  input: BookingFlowResumeInput,
): Promise<Result<BookingFlowResumePoint>> {
  if (
    !isNonEmptyString(input.renterId) ||
    !isNonEmptyString(input.listingId) ||
    !isNonEmptyString(input.startDate) ||
    !isNonEmptyString(input.endDate)
  ) {
    return ok({ step: "listing" });
  }

  const admin = createAdminClient();

  // 1. Look for a live booking (confirmed or pending_payment) for this
  //    renter + listing + exact date range. Most advanced wins.
  const { data: bookingRows, error: bookingError } = await admin
    .from("bookings")
    .select("id, status")
    .eq("renter_id", input.renterId)
    .eq("listing_id", input.listingId)
    .eq("start_date", input.startDate)
    .eq("end_date", input.endDate)
    .in("status", LIVE_BOOKING_STATUSES as unknown as string[]);

  if (bookingError) {
    return err(
      "BOOKING_FLOW_STATE_DATABASE_ERROR",
      bookingError.message ?? "Failed to read bookings",
    );
  }

  if (bookingRows && bookingRows.length > 0) {
    // Prefer `confirmed` over `pending_payment` if both exist.
    const confirmed = bookingRows.find((r) => r.status === "confirmed");
    if (confirmed) {
      return ok({
        step: "confirmed",
        bookingId: confirmed.id as string,
      });
    }
    const pending = bookingRows.find((r) => r.status === "pending_payment");
    if (pending) {
      return ok({
        step: "payment",
        bookingId: pending.id as string,
      });
    }
  }

  // 2. Look for an unsigned contract draft for this tuple. The
  //    `contracts_draft_identity_idx` partial unique index on
  //    `(renter_id, listing_id, start_date, end_date) WHERE signed_at IS NULL`
  //    guarantees at most one row here.
  const { data: contractRow, error: contractError } = await admin
    .from("contracts")
    .select("id")
    .eq("renter_id", input.renterId)
    .eq("listing_id", input.listingId)
    .eq("start_date", input.startDate)
    .eq("end_date", input.endDate)
    .is("signed_at", null)
    .maybeSingle();

  if (contractError) {
    return err(
      "BOOKING_FLOW_STATE_DATABASE_ERROR",
      contractError.message ?? "Failed to read contracts",
    );
  }

  if (contractRow) {
    return ok({
      step: "contract",
      contractId: contractRow.id as string,
    });
  }

  // 3. Nothing persisted yet — stay on the listing step.
  return ok({ step: "listing" });
}

/**
 * True iff the `next` step is strictly further along the booking flow
 * than `current`. Used by page components to decide whether to redirect
 * a renter forward on resume.
 */
const STEP_ORDER: readonly BookingFlowStep[] = [
  "listing",
  "verify",
  "contract",
  "payment",
  "confirmed",
] as const;

export function isStepForward(
  current: BookingFlowStep,
  next: BookingFlowStep,
): boolean {
  return STEP_ORDER.indexOf(next) > STEP_ORDER.indexOf(current);
}
