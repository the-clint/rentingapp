/**
 * Cancellation policy helpers (Story 4-3).
 *
 * Pure, side-effect-free helpers + types for the 48-hour cancellation
 * policy. These live outside `lib/actions/cancellation-actions.ts`
 * because Next.js Server Action files ("use server") can only export
 * async functions — any sync helper, constant, or type alias has to
 * live in a non-"use server" sibling.
 */

export type CancellationOutcome = "refund" | "hold_captured";

export type CancellationError =
  | { code: "CANCELLATION_UNAUTHENTICATED"; message: string }
  | { code: "SESSION_EXPIRED"; message: string }
  | { code: "CANCELLATION_FORBIDDEN"; message: string }
  | { code: "CANCELLATION_BOOKING_NOT_FOUND"; message: string }
  | { code: "CANCELLATION_NOT_ELIGIBLE"; message: string }
  | { code: "CANCELLATION_ALREADY_CANCELLED"; message: string }
  | { code: "OUTCOME_DRIFT"; message: string }
  | { code: "CANCELLATION_STRIPE_ERROR"; message: string }
  | { code: "CANCELLATION_DATABASE_ERROR"; message: string };

export interface PreviewCancellationResult {
  bookingId: string;
  outcome: CancellationOutcome;
  hoursUntilStart: number;
  /**
   * The amount of money at stake: the hold that will be released
   * (refund) or captured (hold_captured). This is `bookings.total_cents`
   * — the server-side source of truth including any extensions.
   */
  amountCents: number;
  listingName: string;
  startDate: string;
  endDate: string;
}

export interface ConfirmCancellationInput {
  acknowledgedOutcome: CancellationOutcome;
}

export interface ConfirmCancellationResult {
  bookingId: string;
  outcome: CancellationOutcome;
  newStatus: "cancelled";
}

const MS_PER_HOUR = 60 * 60 * 1000;

/** The policy boundary: cancellations with `hoursUntilStart >= 48` receive a refund. */
export const CANCELLATION_REFUND_HOURS = 48;

/**
 * Compute `hours_until_start` as (start_date midnight UTC − now) in
 * hours. A negative value means the rental has already started (and
 * cancellation will be rejected by the lifecycle gate before we ever
 * get here).
 */
export function computeHoursUntilStart(
  startDateIso: string,
  now: Date,
): number {
  const [y, m, d] = startDateIso.split("-").map(Number);
  if (!y || !m || !d) {
    throw new Error(`Invalid start_date: ${startDateIso}`);
  }
  const startMs = Date.UTC(y, m - 1, d);
  return (startMs - now.getTime()) / MS_PER_HOUR;
}

/**
 * Pure helper: given `hoursUntilStart`, return the cancellation
 * outcome. Exported so the client + tests can share the exact
 * boundary.
 *
 *   hoursUntilStart >= 48 → 'refund'
 *   hoursUntilStart <  48 → 'hold_captured'
 *
 * Boundary cases:
 *   48.00 → 'refund'
 *   47.99 → 'hold_captured'
 *   47.00 → 'hold_captured'
 */
export function outcomeFromHours(
  hoursUntilStart: number,
): CancellationOutcome {
  return hoursUntilStart >= CANCELLATION_REFUND_HOURS
    ? "refund"
    : "hold_captured";
}
