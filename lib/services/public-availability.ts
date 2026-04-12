/**
 * Public (anon-visible) availability fetch used by the renter-facing booking
 * flow at `app/(renter)/book/[listingId]/page.tsx`. Story 3-2.
 *
 * Returns a day-indexed array of `{ date, state }` entries for a month-sized
 * window. The calendar UI uses this to colour each cell and gate selection.
 *
 * The query runs under the anon PostgREST role when the caller has no
 * session cookie (the typical renter arriving from a classifieds link). It
 * relies on:
 *   - `listing_blocked_dates` column-level grant from migration 00005
 *     (anon sees `listing_id, start_date, end_date, reason`).
 *   - `booking_dates` column-level grant from migration 00005 (anon sees
 *     `listing_id, date`).
 *
 * Past dates and the 5-day post-rental maintenance buffer are computed
 * locally rather than in SQL — keeping the service logic in TypeScript
 * makes it trivial to unit test without a database.
 */

import { createClient } from "@/lib/supabase/server";
import { err, ok, type Result } from "@/lib/utils/result";
import {
  enumerateDateRange,
  todayKey,
  type DateKey,
} from "@/lib/utils/date-range";

export type AvailabilityDateState =
  | "available"
  | "booked"
  | "blocked"
  | "maintenance"
  | "past";

export interface AvailabilityDate {
  date: DateKey;
  state: AvailabilityDateState;
}

export type AvailabilityFetchError = "DATABASE_ERROR";

interface BlockedRow {
  start_date: string;
  end_date: string;
  reason: "operator_block" | "booking" | "maintenance_buffer";
}

interface BookingDateRow {
  date: string;
}

export interface FetchPublicAvailabilityOptions {
  listingId: string;
  /** Inclusive start of the window (YYYY-MM-DD). */
  startDate: DateKey;
  /** Inclusive end of the window (YYYY-MM-DD). */
  endDate: DateKey;
}

/**
 * Fetch availability for a single listing across the inclusive `[start, end]`
 * window. Returns one entry per calendar day in priority order:
 *
 *   past > booked > blocked > maintenance > available
 *
 * So a date that is both in the past AND booked renders as `past`; a date
 * that is booked AND inside an operator maintenance block renders as `booked`.
 */
export async function fetchPublicAvailability(
  options: FetchPublicAvailabilityOptions,
): Promise<Result<AvailabilityDate[]>> {
  const { listingId, startDate, endDate } = options;
  if (startDate > endDate) {
    return err("DATABASE_ERROR", "startDate must be on or before endDate");
  }
  const supabase = await createClient();

  const blockedQuery = await supabase
    .from("listing_blocked_dates")
    .select("start_date, end_date, reason")
    .eq("listing_id", listingId)
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  if (blockedQuery.error) {
    return err("DATABASE_ERROR", blockedQuery.error.message);
  }

  const bookingQuery = await supabase
    .from("booking_dates")
    .select("date")
    .eq("listing_id", listingId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (bookingQuery.error) {
    return err("DATABASE_ERROR", bookingQuery.error.message);
  }

  const blockedRows = (blockedQuery.data ?? []) as BlockedRow[];
  const bookingRows = (bookingQuery.data ?? []) as BookingDateRow[];

  // Build a state map keyed by DateKey. Priority-order the writes:
  // available (default) < blocked < maintenance < booked < past.
  const stateByDate = new Map<DateKey, AvailabilityDateState>();
  const today = todayKey();

  for (const row of blockedRows) {
    const stateForRow: AvailabilityDateState =
      row.reason === "maintenance_buffer"
        ? "maintenance"
        : row.reason === "booking"
          ? "booked"
          : "blocked";
    for (const key of enumerateDateRange(row.start_date, row.end_date)) {
      if (key < startDate || key > endDate) continue;
      const current = stateByDate.get(key);
      if (current === "booked") continue;
      if (current === "maintenance" && stateForRow === "blocked") continue;
      stateByDate.set(key, stateForRow);
    }
  }
  for (const row of bookingRows) {
    stateByDate.set(row.date, "booked");
  }

  const out: AvailabilityDate[] = [];
  for (const key of enumerateDateRange(startDate, endDate)) {
    let state = stateByDate.get(key) ?? "available";
    if (key < today) {
      state = "past";
    }
    out.push({ date: key, state });
  }

  return ok(out);
}
