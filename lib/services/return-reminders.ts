/**
 * Return reminder service (Story 4-5).
 *
 * `dispatchReturnReminders` is the pure (well, DB-touching but
 * stateless) worker that the `/api/cron/return-reminders` endpoint
 * calls once per day. It:
 *
 *   1. Loads every booking whose `end_date === today` and whose status
 *      is still 'confirmed' (so we don't spam someone who already
 *      checked in or cancelled).
 *   2. For each booking, attempts to send the return-reminder SMS via
 *      the `sendReturnReminderSms` stub (real Twilio in Story 6-4).
 *   3. Inserts a `sms_log` row with `purpose = 'return-reminder'`,
 *      status 'sent' or 'failed', and `operator_id` populated so the
 *      operator's notification badge can count failures (Story 6-5).
 *   4. Returns a summary so the caller can log counts / test.
 *
 * The idempotency guard on `sms_log` (unique on
 * `(booking_id, purpose, created_at::date) WHERE purpose =
 * 'return-reminder'`) means a second call on the same day is a no-op
 * per booking — the unique-violation is swallowed and the booking is
 * reported as 'skipped'.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendReturnReminderSms } from "@/lib/services/notifications";

export interface DispatchReturnRemindersArgs {
  admin: SupabaseClient;
  today: string; // YYYY-MM-DD in the operator's timezone; UTC is fine for MVP.
  publicBaseUrl: string; // e.g. "https://rentingapp.example" — used for the manage link.
}

export interface DispatchReturnRemindersResult {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  failures: Array<{ bookingId: string; reason: string }>;
}

interface ReminderBookingRow {
  id: string;
  renter_id: string;
  end_date: string;
  listing_id: string;
  listings: { name: string; operator_id: string } | null;
  renter: { phone: string | null } | null;
}

export async function dispatchReturnReminders(
  args: DispatchReturnRemindersArgs,
): Promise<DispatchReturnRemindersResult> {
  const { admin, today, publicBaseUrl } = args;

  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, renter_id, end_date, listing_id, listings(name, operator_id)",
    )
    .eq("status", "confirmed")
    .eq("end_date", today);

  if (error) {
    throw new Error(
      `[return-reminders] failed to load today's bookings: ${error.message}`,
    );
  }

  const rows = (data ?? []) as unknown as ReminderBookingRow[];

  const result: DispatchReturnRemindersResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    failures: [],
  };

  for (const row of rows) {
    result.attempted += 1;

    // Look up the renter phone from auth.users via the admin API. We
    // don't join through `auth.users` in the SQL select because it's
    // a protected schema for anon/authenticated; the service-role
    // admin client has a dedicated helper.
    let phone: string | null = null;
    try {
      const { data: userData } = await admin.auth.admin.getUserById(
        row.renter_id,
      );
      phone = userData.user?.phone ?? null;
      if (phone && !phone.startsWith("+")) {
        phone = `+${phone}`;
      }
    } catch {
      phone = null;
    }

    if (!phone) {
      result.failed += 1;
      result.failures.push({
        bookingId: row.id,
        reason: "renter phone not found",
      });
      await logSms(admin, {
        bookingId: row.id,
        listingId: row.listing_id,
        operatorId: row.listings?.operator_id ?? null,
        phone: "",
        body: "",
        status: "failed",
        error: "renter phone not found",
      });
      continue;
    }

    const listingName = row.listings?.name ?? "your rental";
    const manageUrl = `${publicBaseUrl.replace(/\/$/, "")}/rentals`;
    const body = `📦 Your ${listingName} rental return is today. Manage: ${manageUrl}`;

    // Idempotency: attempt to insert a 'queued' row FIRST. If the
    // unique index fires we skip this booking (already sent today).
    const queued = await insertQueuedReminder(admin, {
      bookingId: row.id,
      listingId: row.listing_id,
      operatorId: row.listings?.operator_id ?? null,
      phone,
      body,
    });
    if (queued === "duplicate") {
      result.skipped += 1;
      continue;
    }
    if (queued === "error") {
      result.failed += 1;
      result.failures.push({
        bookingId: row.id,
        reason: "sms_log insert failed",
      });
      continue;
    }

    try {
      await sendReturnReminderSms({
        phone,
        listingName,
        manageUrl,
      });
      await admin
        .from("sms_log")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", queued);
      result.sent += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown SMS error";
      await admin
        .from("sms_log")
        .update({ status: "failed", error: message })
        .eq("id", queued);
      result.failed += 1;
      result.failures.push({ bookingId: row.id, reason: message });
    }
  }

  return result;
}

async function insertQueuedReminder(
  admin: SupabaseClient,
  args: {
    bookingId: string;
    listingId: string;
    operatorId: string | null;
    phone: string;
    body: string;
  },
): Promise<string | "duplicate" | "error"> {
  const { data, error } = await admin
    .from("sms_log")
    .insert({
      direction: "outbound",
      purpose: "return-reminder",
      phone: args.phone,
      body: args.body,
      status: "queued",
      booking_id: args.bookingId,
      listing_id: args.listingId,
      operator_id: args.operatorId,
    })
    .select("id")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return "duplicate";
    }
    console.error(
      "[return-reminders] sms_log insert failed",
      error.message,
    );
    return "error";
  }
  return (data as { id: string }).id;
}

async function logSms(
  admin: SupabaseClient,
  args: {
    bookingId: string;
    listingId: string;
    operatorId: string | null;
    phone: string;
    body: string;
    status: "queued" | "sent" | "failed";
    error?: string;
  },
): Promise<void> {
  await admin.from("sms_log").insert({
    direction: "outbound",
    purpose: "return-reminder",
    phone: args.phone,
    body: args.body,
    status: args.status,
    error: args.error ?? null,
    booking_id: args.bookingId,
    listing_id: args.listingId,
    operator_id: args.operatorId,
  });
}
