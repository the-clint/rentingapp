/**
 * Notification service stubs (Story 3-5).
 *
 * Story 3-5 needs to "send an SMS confirmation on successful booking"
 * per the AC. We ship a no-op stub here so Story 3-5 can land without
 * pulling Twilio client code — that surface is owned by Story 6-4
 * ("Automated lifecycle SMS notifications").
 *
 * TODO(Story 6-4): swap this stub for a real Twilio client call. The
 * call sites in `payment-actions.ts` already pass the correct
 * `{ phone, body }` shape, so only this file needs to change.
 */

export interface BookingConfirmationSmsInput {
  phone: string;
  body: string;
}

export interface NotificationResult {
  delivered: boolean;
  stub: true;
}

/**
 * Send a booking confirmation SMS to the renter. Currently logs and
 * returns a resolved "stub delivered" result. Never throws — a failure
 * to send an SMS should not roll back a successful booking
 * confirmation.
 */
export async function sendBookingConfirmationSms(
  input: BookingConfirmationSmsInput,
): Promise<NotificationResult> {
  console.info(
    "[notifications:stub] sendBookingConfirmationSms",
    JSON.stringify({ phone: input.phone, bodyPreview: input.body.slice(0, 80) }),
  );
  return { delivered: true, stub: true };
}

export type BookingCancellationOutcome = "refund" | "hold_captured";

export interface BookingCancellationSmsInput {
  phone: string;
  outcome: BookingCancellationOutcome;
}

/**
 * Send a booking cancellation confirmation SMS to the renter (Story 4-3).
 * Stub — same contract and TODO as `sendBookingConfirmationSms`. The
 * real Twilio delivery ships in Story 6-4.
 *
 * `outcome` is a structured enum instead of a free-form body so this
 * stub can grow into a templating layer in Story 6-4 without the
 * callers having to care about the copy.
 */
export async function sendBookingCancellationSms(
  input: BookingCancellationSmsInput,
): Promise<NotificationResult> {
  console.info(
    "[notifications:stub] sendBookingCancellationSms",
    JSON.stringify({ phone: input.phone, outcome: input.outcome }),
  );
  return { delivered: true, stub: true };
}

export interface BookingExtensionSmsInput {
  phone: string;
  body: string;
}

/**
 * Send a booking extension confirmation SMS to the renter (Story 4-2).
 * Stub — same contract and TODO as `sendBookingConfirmationSms`. The
 * real Twilio delivery ships in Story 6-4.
 */
export async function sendBookingExtensionSms(
  input: BookingExtensionSmsInput,
): Promise<NotificationResult> {
  console.info(
    "[notifications:stub] sendBookingExtensionSms",
    JSON.stringify({ phone: input.phone, bodyPreview: input.body.slice(0, 80) }),
  );
  return { delivered: true, stub: true };
}
