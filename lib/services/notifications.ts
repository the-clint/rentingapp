/**
 * Notification service (Stories 3-5 / 4-2 / 4-3 / 4-4 / 4-5 / 6-4 / 6-5).
 *
 * Story 6-4 swaps the original no-op stubs for real Twilio sendSms
 * calls routed through `lib/services/twilio.ts`. The Twilio facade
 * falls back to a logging stub when `TWILIO_*` env vars are not
 * configured, so every function here remains safe to call from any
 * environment. Failures are LOGGED but not thrown — callers must
 * never roll back a successful booking event on a notification
 * delivery failure.
 *
 * Every send is also mirrored into `sms_log` for the audit trail +
 * operator notification badge (Story 6-5).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/services/twilio";

export interface NotificationResult {
  delivered: boolean;
  stub: boolean;
}

interface LifecycleSmsInput {
  bookingId?: string;
  listingId?: string | null;
  operatorId?: string | null;
  phone: string;
  purpose: string;
  body: string;
}

function safeAdminClient(): ReturnType<typeof createAdminClient> | null {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

async function logSmsRow(
  admin: ReturnType<typeof createAdminClient> | null,
  input: LifecycleSmsInput,
  status: "sent" | "failed",
  error?: string,
): Promise<void> {
  if (!admin) return;
  try {
    await admin.from("sms_log").insert({
      direction: "outbound",
      purpose: input.purpose,
      phone: input.phone,
      body: input.body,
      status,
      error: error ?? null,
      booking_id: input.bookingId ?? null,
      listing_id: input.listingId ?? null,
      operator_id: input.operatorId ?? null,
    });
  } catch {
    // Swallow — notifications must never roll back a successful event.
  }
}

async function sendAndLog(input: LifecycleSmsInput): Promise<NotificationResult> {
  const admin = safeAdminClient();
  try {
    const result = await sendSms({ to: input.phone, body: input.body });
    console.info(
      "[notifications]",
      input.purpose,
      JSON.stringify({
        phone: input.phone,
        bodyPreview: input.body.slice(0, 80),
        stub: result.stub,
      }),
    );
    await logSmsRow(admin, input, "sent");
    return { delivered: true, stub: result.stub };
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown sms error";
    console.error("[notifications] sms send failed", input.purpose, message);
    await logSmsRow(admin, input, "failed", message);
    return { delivered: false, stub: false };
  }
}

export interface BookingConfirmationSmsInput {
  phone: string;
  body: string;
  bookingId?: string;
}

export async function sendBookingConfirmationSms(
  input: BookingConfirmationSmsInput,
): Promise<NotificationResult> {
  return sendAndLog({
    phone: input.phone,
    purpose: "booking-confirmation",
    body: input.body,
    bookingId: input.bookingId,
  });
}

export type BookingCancellationOutcome = "refund" | "hold_captured";

export interface BookingCancellationSmsInput {
  phone: string;
  outcome: BookingCancellationOutcome;
  bookingId?: string;
}

export async function sendBookingCancellationSms(
  input: BookingCancellationSmsInput,
): Promise<NotificationResult> {
  const body =
    input.outcome === "refund"
      ? "Booking cancelled. Your hold will be released. Details: /rentals"
      : "Booking cancelled. Per the 48-hour policy, your hold was captured. Details: /rentals";
  return sendAndLog({
    phone: input.phone,
    purpose: "booking-cancellation",
    body,
    bookingId: input.bookingId,
  });
}

export interface BookingExtensionSmsInput {
  phone: string;
  body: string;
  bookingId?: string;
}

export async function sendBookingExtensionSms(
  input: BookingExtensionSmsInput,
): Promise<NotificationResult> {
  return sendAndLog({
    phone: input.phone,
    purpose: "booking-extension",
    body: input.body,
    bookingId: input.bookingId,
  });
}

export interface CheckInOperatorNotificationInput {
  bookingId: string;
  listingName: string;
  condition: "good" | "damage" | "issue";
  operatorPhone?: string;
  operatorId?: string;
}

export async function notifyOperatorCheckInSubmitted(
  input: CheckInOperatorNotificationInput,
): Promise<NotificationResult> {
  if (!input.operatorPhone) {
    console.info(
      "[notifications] operator check-in notification skipped (no phone)",
      JSON.stringify({ bookingId: input.bookingId, condition: input.condition }),
    );
    return { delivered: true, stub: true };
  }
  const body = `📬 New check-in: ${input.listingName} · condition ${input.condition}. Review in your bookings.`;
  return sendAndLog({
    phone: input.operatorPhone,
    purpose: "operator-check-in",
    body,
    bookingId: input.bookingId,
    operatorId: input.operatorId,
  });
}

export interface ReturnReminderSmsInput {
  phone: string;
  listingName: string;
  manageUrl: string;
  bookingId?: string;
}

export async function sendReturnReminderSms(
  input: ReturnReminderSmsInput,
): Promise<NotificationResult> {
  const body = `📦 Your ${input.listingName} rental return is today. Manage: ${input.manageUrl}`;
  return sendAndLog({
    phone: input.phone,
    purpose: "return-reminder",
    body,
    bookingId: input.bookingId,
  });
}

export interface NoShowCaptureSmsInput {
  phone: string;
  listingName: string;
  amountCents: number;
  bookingId?: string;
}

export async function sendNoShowCaptureSms(
  input: NoShowCaptureSmsInput,
): Promise<NotificationResult> {
  const body = `Your booking for ${input.listingName} was marked as a no-show. $${(input.amountCents / 100).toFixed(2)} captured per your signed contract.`;
  return sendAndLog({
    phone: input.phone,
    purpose: "no-show-capture",
    body,
    bookingId: input.bookingId,
  });
}
