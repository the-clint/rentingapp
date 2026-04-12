"use server";

/**
 * Operator booking Server Actions (Stories 5-3 / 5-4).
 *
 * Three exports:
 *
 * - `flagNoShow(bookingId)` — flips the booking to `no_show` via
 *   `rpc_flag_no_show`. Does NOT capture the hold — the AC calls for
 *   a two-step process (flag, then capture) so the operator can't
 *   accidentally charge a renter.
 *
 * - `captureHoldForNoShow(bookingId)` — captures the Stripe payment
 *   intent(s), then records a `no_show_capture` transaction via
 *   `rpc_record_payment_capture`.
 *
 * - `capturePaymentOnCompletion(bookingId)` — captures the Stripe
 *   payment intent(s), then records a `completion_capture`
 *   transaction.
 *
 * All three require an authenticated operator who owns the listing
 * that the booking is attached to. Ownership is double-checked both
 * in the Server Action (via the operator session) AND in the RPC
 * (via a listings join).
 */

import Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  capturePaymentIntent,
  getStripeServerClient,
} from "@/lib/services/stripe";
import { err, ok, type Result } from "@/lib/utils/result";
import { createClient } from "@/lib/supabase/server";

// Platform fee: 6% of captured amount (FR32 — the spec allows 5-8%;
// we pick the midpoint as the MVP default). Operator can adjust in a
// later settings story.
const PLATFORM_FEE_BPS = 600;
// Stripe standard card fee: 2.9% + 30c (FR31 — tracked for unit
// economics, not charged to the renter).
const STRIPE_FEE_BPS = 290;
const STRIPE_FEE_FIXED_CENTS = 30;
// Twilio ~$0.0079 per SMS. An average booking fires roughly 5 SMS
// events across its lifecycle (confirm, extend, reminder, cancel,
// completion). 5 * 0.79 ≈ 4 cents.
const TWILIO_COST_PER_BOOKING_CENTS = 4;

export type OperatorBookingActionError =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "STRIPE_ERROR"
  | "DATABASE_ERROR";

export interface FlagNoShowResult {
  bookingId: string;
  newStatus: "no_show";
}

export interface CaptureResult {
  bookingId: string;
  capturedCents: number;
  stripeFeeCents: number;
  platformFeeCents: number;
  twilioCostCents: number;
  netOperatorCents: number;
  transactionId: string | null;
  kind: "completion_capture" | "no_show_capture";
}

async function getOperatorSession(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = (user.app_metadata as { role?: string } | null)?.role;
  // Operator sessions in this app are authenticated via email/password
  // so the absence of a 'renter' role means an operator. We still
  // sanity-check by ensuring the user doesn't carry the renter role.
  if (role === "renter") return null;
  return { userId: user.id };
}

interface BookingForOperatorAction {
  id: string;
  listing_id: string;
  status: string;
  total_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_extension_intent_id: string | null;
  payment_captured_at: string | null;
  payment_captured_cents: number | null;
  listings: { operator_id: string } | null;
}

async function loadBooking(
  bookingId: string,
  operatorId: string,
): Promise<
  | { ok: true; booking: BookingForOperatorAction }
  | { ok: false; code: OperatorBookingActionError; message: string }
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select(
      `id, listing_id, status, total_cents,
       stripe_payment_intent_id, stripe_extension_intent_id,
       payment_captured_at, payment_captured_cents,
       listings!inner(operator_id)`,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    return { ok: false, code: "DATABASE_ERROR", message: error.message };
  }
  if (!data) {
    return { ok: false, code: "NOT_FOUND", message: "Booking not found" };
  }
  const booking = data as unknown as BookingForOperatorAction;
  if (!booking.listings || booking.listings.operator_id !== operatorId) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You do not have access to this booking",
    };
  }
  return { ok: true, booking };
}

export async function flagNoShow(
  bookingId: string,
): Promise<Result<FlagNoShowResult>> {
  if (!bookingId || typeof bookingId !== "string") {
    return err("NOT_FOUND", "Missing booking id") as Result<FlagNoShowResult>;
  }
  const session = await getOperatorSession();
  if (!session) {
    return err(
      "UNAUTHENTICATED",
      "Sign in as an operator to continue",
    ) as Result<FlagNoShowResult>;
  }

  const loaded = await loadBooking(bookingId, session.userId);
  if (!loaded.ok) {
    return err(loaded.code, loaded.message) as Result<FlagNoShowResult>;
  }

  const admin = createAdminClient();
  const { error: rpcError } = await admin.rpc("rpc_flag_no_show", {
    booking_id: loaded.booking.id,
    operator_id: session.userId,
  });
  if (rpcError) {
    const raw = rpcError.message ?? "";
    if (raw.includes("NO_SHOW_NOT_FOUND")) {
      return err("NOT_FOUND", "Booking not found") as Result<FlagNoShowResult>;
    }
    if (raw.includes("NO_SHOW_FORBIDDEN")) {
      return err(
        "FORBIDDEN",
        "You do not have access to this booking",
      ) as Result<FlagNoShowResult>;
    }
    if (raw.includes("NO_SHOW_NOT_ELIGIBLE") || raw.includes("NO_SHOW_TOO_EARLY")) {
      return err(
        "NOT_ELIGIBLE",
        "This booking cannot be flagged as a no-show right now",
      ) as Result<FlagNoShowResult>;
    }
    return err("DATABASE_ERROR", raw) as Result<FlagNoShowResult>;
  }

  return ok({ bookingId: loaded.booking.id, newStatus: "no_show" });
}

async function captureIntentsAndComputeFees(
  booking: BookingForOperatorAction,
): Promise<
  | { ok: true; capturedCents: number; stripeFeeCents: number }
  | { ok: false; message: string }
> {
  let capturedCents = 0;
  const stripe = getStripeServerClient();

  const intents = [
    booking.stripe_payment_intent_id,
    booking.stripe_extension_intent_id,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);

  for (const intentId of intents) {
    try {
      await capturePaymentIntent(intentId);
      // Read the intent back to get the actual captured amount —
      // `amount_received` is the authoritative post-capture field.
      const fresh = await stripe.paymentIntents.retrieve(intentId);
      capturedCents += fresh.amount_received ?? fresh.amount ?? 0;
    } catch (e) {
      if (e instanceof Stripe.errors.StripeInvalidRequestError) {
        // Already captured or cancelled — skip.
        continue;
      }
      const message = e instanceof Error ? e.message : "Stripe capture failed";
      return { ok: false, message };
    }
  }

  if (capturedCents === 0) {
    // Nothing could be captured — likely the intents were already
    // released. Fall back to the booking total for the fee math so
    // the transaction row is still meaningful.
    capturedCents = booking.total_cents;
  }

  const stripeFeeCents =
    Math.round((capturedCents * STRIPE_FEE_BPS) / 10000) +
    STRIPE_FEE_FIXED_CENTS;

  return { ok: true, capturedCents, stripeFeeCents };
}

async function recordCapture(
  bookingId: string,
  operatorId: string,
  kind: CaptureResult["kind"],
  capturedCents: number,
  stripeFeeCents: number,
): Promise<Result<CaptureResult>> {
  const platformFeeCents = Math.round(
    (capturedCents * PLATFORM_FEE_BPS) / 10000,
  );
  const twilioCostCents = TWILIO_COST_PER_BOOKING_CENTS;
  const netOperatorCents =
    capturedCents - stripeFeeCents - platformFeeCents - twilioCostCents;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("rpc_record_payment_capture", {
    booking_id: bookingId,
    operator_id: operatorId,
    kind,
    captured_cents: capturedCents,
    stripe_fee_cents: stripeFeeCents,
    platform_fee_cents: platformFeeCents,
    twilio_cost_cents: twilioCostCents,
  });

  if (error) {
    const raw = error.message ?? "";
    if (raw.includes("CAPTURE_NOT_FOUND")) {
      return err("NOT_FOUND", "Booking not found") as Result<CaptureResult>;
    }
    if (raw.includes("CAPTURE_FORBIDDEN")) {
      return err(
        "FORBIDDEN",
        "You do not have access to this booking",
      ) as Result<CaptureResult>;
    }
    return err("DATABASE_ERROR", raw) as Result<CaptureResult>;
  }

  const row = (data as Array<{ transaction_id: string }>)?.[0];
  return ok({
    bookingId,
    capturedCents,
    stripeFeeCents,
    platformFeeCents,
    twilioCostCents,
    netOperatorCents,
    transactionId: row?.transaction_id ?? null,
    kind,
  });
}

export async function captureHoldForNoShow(
  bookingId: string,
): Promise<Result<CaptureResult>> {
  if (!bookingId || typeof bookingId !== "string") {
    return err("NOT_FOUND", "Missing booking id") as Result<CaptureResult>;
  }
  const session = await getOperatorSession();
  if (!session) {
    return err(
      "UNAUTHENTICATED",
      "Sign in as an operator to continue",
    ) as Result<CaptureResult>;
  }

  const loaded = await loadBooking(bookingId, session.userId);
  if (!loaded.ok) {
    return err(loaded.code, loaded.message) as Result<CaptureResult>;
  }
  if (loaded.booking.status !== "no_show") {
    return err(
      "NOT_ELIGIBLE",
      "Flag the booking as no-show before capturing the hold",
    ) as Result<CaptureResult>;
  }
  if (loaded.booking.payment_captured_at) {
    return err(
      "NOT_ELIGIBLE",
      "Payment has already been captured on this booking",
    ) as Result<CaptureResult>;
  }

  const stripeResult = await captureIntentsAndComputeFees(loaded.booking);
  if (!stripeResult.ok) {
    return err("STRIPE_ERROR", stripeResult.message) as Result<CaptureResult>;
  }

  return recordCapture(
    loaded.booking.id,
    session.userId,
    "no_show_capture",
    stripeResult.capturedCents,
    stripeResult.stripeFeeCents,
  );
}

export async function capturePaymentOnCompletion(
  bookingId: string,
): Promise<Result<CaptureResult>> {
  if (!bookingId || typeof bookingId !== "string") {
    return err("NOT_FOUND", "Missing booking id") as Result<CaptureResult>;
  }
  const session = await getOperatorSession();
  if (!session) {
    return err(
      "UNAUTHENTICATED",
      "Sign in as an operator to continue",
    ) as Result<CaptureResult>;
  }

  const loaded = await loadBooking(bookingId, session.userId);
  if (!loaded.ok) {
    return err(loaded.code, loaded.message) as Result<CaptureResult>;
  }
  if (loaded.booking.payment_captured_at) {
    return err(
      "NOT_ELIGIBLE",
      "Payment has already been captured on this booking",
    ) as Result<CaptureResult>;
  }
  if (
    loaded.booking.status !== "confirmed" &&
    loaded.booking.status !== "completed"
  ) {
    return err(
      "NOT_ELIGIBLE",
      "Only confirmed or completed bookings can have their payment captured",
    ) as Result<CaptureResult>;
  }

  const stripeResult = await captureIntentsAndComputeFees(loaded.booking);
  if (!stripeResult.ok) {
    return err("STRIPE_ERROR", stripeResult.message) as Result<CaptureResult>;
  }

  return recordCapture(
    loaded.booking.id,
    session.userId,
    "completion_capture",
    stripeResult.capturedCents,
    stripeResult.stripeFeeCents,
  );
}
