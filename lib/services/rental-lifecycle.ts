/**
 * Rental lifecycle state machine (Story 4-1).
 *
 * Pure helper that classifies a renter booking into one of six dashboard
 * states given "today". It is deliberately side-effect free and has zero
 * database / React / Next.js imports so it can be unit-tested in isolation
 * and called from both Server Components and Server Actions.
 *
 * The classification rules:
 *   - `cancelled`        — bookings.status === 'cancelled' (no actions).
 *   - `past_completed`   — end_date is more than 45 days ago (FR17 — the
 *                          dashboard filters these out before rendering).
 *   - `completed`        — end_date has passed (within 45 days) and the
 *                          status has been flipped to 'completed'.
 *   - `return_due`       — today is in [end_date, end_date + buffer] and
 *                          the booking is still active/confirmed (i.e.
 *                          renter still has the equipment past its end).
 *   - `active`           — today is in [start_date, end_date] and status
 *                          is 'confirmed'.
 *   - `upcoming`         — today < start_date and status is 'confirmed'.
 *
 * "pending_payment" (renter abandoned the booking flow before Stripe hold)
 * is NOT a state exposed here — the dashboard filters those rows out at
 * the query layer in `renter-rentals.ts`. They resume via Story 3-6 from
 * the /book/[id]/... URLs, not /rentals.
 *
 * Contextual actions per state (Story 4-1 AC + routing targets for
 * 4-2/4-3/4-4):
 *   upcoming    → Cancel Booking          → /rentals/[id]/cancel
 *   active      → Extend Rental           → /rentals/[id]/extend
 *   return_due  → Extend Rental + Check In→ /rentals/[id]/extend, /check-in
 *   completed   → (view only)
 *   cancelled   → (view only, muted)
 */

export const RENTAL_LIFECYCLE_STATES = [
  "upcoming",
  "active",
  "return_due",
  "completed",
  "cancelled",
  "past_completed",
] as const;

export type RentalLifecycleState = (typeof RENTAL_LIFECYCLE_STATES)[number];

export type RentalBadgeTone =
  | "success" // Confirmed / upcoming — green
  | "primary" // Active — amber (primary brand color)
  | "warning" // Return Due — gold with pulse
  | "muted" // Completed — grey muted
  | "destructive"; // Cancelled — muted red

export type RentalLifecycleAction =
  | "cancel"
  | "extend"
  | "check-in";

export interface RentalLifecycle {
  state: RentalLifecycleState;
  /** Human-readable label for the status badge, e.g. "Return Due". */
  statusLabel: string;
  /** Visual tone token for the badge; consumed by `RentalCard`. */
  badgeTone: RentalBadgeTone;
  /** Whether this card is historical (no actions, muted rendering). */
  isPast: boolean;
  /** Contextual actions the renter can take from this card. */
  actionsAvailable: readonly RentalLifecycleAction[];
}

/**
 * Subset of the bookings row required to compute the lifecycle. We accept
 * plain strings (ISO YYYY-MM-DD) to match what Supabase returns for `date`
 * columns, and avoid tying the helper to a specific Supabase generated type.
 */
export interface RentalLifecycleInput {
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  startDate: string;
  endDate: string;
}

/**
 * 4 extension days + 1 maintenance day (FR25). This is the window in which
 * a confirmed rental whose end_date has passed is still considered "return
 * due" — after which (if nobody checked it in), the operator will deal
 * with it via Epic 5.
 */
export const RENTAL_BUFFER_DAYS = 5;

/**
 * Past rentals are visible on the dashboard for 45 days after their end
 * date (FR17). Anything older is hidden at the query level.
 */
export const RENTAL_HISTORY_VISIBILITY_DAYS = 45;

function toUtcDay(iso: string): number {
  // Parse as UTC midnight so day math is stable across DST boundaries.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  return Date.UTC(y, m - 1, d);
}

function diffDays(aMs: number, bMs: number): number {
  const ms = aMs - bMs;
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Compute the lifecycle state for a booking given a reference "today".
 *
 * `today` is passed explicitly so callers (tests + Server Components) can
 * control the clock. Both `today` and the booking dates are treated as
 * calendar days — time-of-day is intentionally ignored.
 */
export function computeRentalLifecycle(
  booking: RentalLifecycleInput,
  today: Date,
): RentalLifecycle {
  const todayMs = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const startMs = toUtcDay(booking.startDate);
  const endMs = toUtcDay(booking.endDate);

  if (booking.status === "cancelled") {
    return {
      state: "cancelled",
      statusLabel: "Cancelled",
      badgeTone: "destructive",
      isPast: true,
      actionsAvailable: [],
    };
  }

  const daysSinceEnd = diffDays(todayMs, endMs);

  // > 45 days after end date → history-hidden.
  if (daysSinceEnd > RENTAL_HISTORY_VISIBILITY_DAYS) {
    return {
      state: "past_completed",
      statusLabel: "Completed",
      badgeTone: "muted",
      isPast: true,
      actionsAvailable: [],
    };
  }

  // Explicitly completed (operator or system flipped the status) within
  // the 45-day history window.
  if (booking.status === "completed") {
    return {
      state: "completed",
      statusLabel: "Completed",
      badgeTone: "muted",
      isPast: true,
      actionsAvailable: [],
    };
  }

  // Buffer window: end date has passed but we're still within the 5-day
  // buffer AND the booking is still marked confirmed/pending — the renter
  // hasn't checked it in.
  if (daysSinceEnd > 0 && daysSinceEnd <= RENTAL_BUFFER_DAYS) {
    return {
      state: "return_due",
      statusLabel: "Return Due",
      badgeTone: "warning",
      isPast: false,
      actionsAvailable: ["extend", "check-in"],
    };
  }

  // If we're past the buffer window but not yet > 45 days, and status is
  // still confirmed, fall through to "completed" styling (treat as a
  // silently-finished rental — operator will reconcile in Epic 5).
  if (daysSinceEnd > RENTAL_BUFFER_DAYS) {
    return {
      state: "completed",
      statusLabel: "Completed",
      badgeTone: "muted",
      isPast: true,
      actionsAvailable: [],
    };
  }

  // Today is strictly within [start_date, end_date].
  if (todayMs >= startMs && todayMs <= endMs) {
    return {
      state: "active",
      statusLabel: "Active",
      badgeTone: "primary",
      isPast: false,
      actionsAvailable: todayMs === endMs
        ? // Last day: offer both extend + check-in so the renter can hit
          // "check in" without waiting for midnight to roll them into
          // the return_due bucket.
          ["extend", "check-in"]
        : ["extend"],
    };
  }

  // Fallthrough: upcoming.
  return {
    state: "upcoming",
    statusLabel: "Confirmed",
    badgeTone: "success",
    isPast: false,
    actionsAvailable: ["cancel"],
  };
}
