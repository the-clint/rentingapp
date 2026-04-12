/**
 * Data retention policy (Story 7-2, FR17 / NFR11 / NFR16 / NFR18).
 *
 * Three rules:
 *
 *   1. **Renter dashboard visibility — 45 days.**
 *      `fetchRenterRentals` filters by
 *      `end_date >= today - 45 days`. Rows outside the window are
 *      hidden from the renter dashboard but remain accessible to
 *      the operator.
 *
 *   2. **Operator retention — 3 years.**
 *      Nothing deletes bookings, contracts, check-ins, messages, or
 *      transactions for the first 3 years. Operators can access
 *      every row in that window through the Epic 5 / Epic 6 views.
 *
 *   3. **Disassociated records — retained, phone masked in UI.**
 *      Story 7-1 sets `bookings.renter_dashboard_hidden_at` but
 *      preserves the row and all joined data. The operator views
 *      keep displaying the original renter phone with a
 *      "disassociated" indicator so there's no loss of evidence
 *      for dispute resolution.
 *
 * `purgeExpiredRecords` runs the 3-year sweep against `bookings`,
 * cascading deletes to `booking_dates`, `contracts`, `check_ins`,
 * `transactions`, `messages` (via conversation cascade), and
 * `sms_log`. Intended to be invoked by the retention cron endpoint
 * below at most once per day.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const RENTER_VISIBILITY_DAYS = 45;
export const OPERATOR_RETENTION_DAYS = 365 * 3;

export interface PurgeExpiredRecordsResult {
  bookingsDeleted: number;
  smsLogsDeleted: number;
}

export async function purgeExpiredRecords(
  admin: SupabaseClient,
  today: Date = new Date(),
): Promise<PurgeExpiredRecordsResult> {
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - OPERATOR_RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();
  const cutoffDate = cutoffIso.slice(0, 10);

  // bookings whose end_date is before the cutoff → delete. ON DELETE
  // CASCADE in the schema removes booking_dates, contracts,
  // check_ins, transactions automatically.
  const { data: deletedBookings, error: bookingsError } = await admin
    .from("bookings")
    .delete()
    .lt("end_date", cutoffDate)
    .select("id");

  if (bookingsError) {
    throw new Error(
      `[retention] bookings delete failed: ${bookingsError.message}`,
    );
  }

  // sms_log is not FK'd to bookings in the same lifecycle-tight way;
  // purge its own rows older than the cutoff independently.
  const { data: deletedSms, error: smsError } = await admin
    .from("sms_log")
    .delete()
    .lt("created_at", cutoffIso)
    .select("id");

  if (smsError) {
    throw new Error(
      `[retention] sms_log delete failed: ${smsError.message}`,
    );
  }

  return {
    bookingsDeleted: (deletedBookings ?? []).length,
    smsLogsDeleted: (deletedSms ?? []).length,
  };
}
