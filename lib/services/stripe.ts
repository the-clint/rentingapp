/**
 * Stripe server SDK wrapper (Story 3-5).
 *
 * Thin, well-typed facade around the `stripe` Node SDK. Keeps the
 * API version pinned and isolates every call the rest of the app makes
 * against Stripe so tests can mock at this layer rather than against the
 * SDK directly.
 *
 * IMPORTANT: this module is server-only. It reads `STRIPE_SECRET_KEY`
 * which is secret (varlock + BWS). Never import it from a Client
 * Component.
 */

import Stripe from "stripe";

// Pinned API version for deterministic Stripe behavior across releases.
// Bumping this is an intentional change — tests + types will surface the
// difference. Matches the pinned SDK version in package.json (stripe@22).
export const STRIPE_API_VERSION = "2026-03-25.dahlia" as const;

let cachedClient: Stripe | null = null;

export interface StripeClientDeps {
  apiKey?: string;
}

/**
 * Lazy singleton Stripe client. The client is shared across Server
 * Actions + the webhook route within a single server process — Stripe's
 * SDK is thread-safe and keeps an internal http agent pool.
 */
export function getStripeServerClient(deps: StripeClientDeps = {}): Stripe {
  if (cachedClient) return cachedClient;

  const apiKey = deps.apiKey ?? process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing STRIPE_SECRET_KEY. Check .env.schema + Bitwarden Secrets Manager.",
    );
  }

  cachedClient = new Stripe(apiKey, {
    apiVersion: STRIPE_API_VERSION,
    // Small retry for transient network blips — any Stripe 5xx/network
    // fault will retry twice before surfacing.
    maxNetworkRetries: 2,
    typescript: true,
  });
  return cachedClient;
}

/**
 * Escape hatch for tests — clears the cached singleton so a fresh mock
 * can be injected by the next call to `getStripeServerClient`.
 */
export function resetStripeClientForTests(): void {
  cachedClient = null;
}

export interface CreateBookingHoldIntentInput {
  bookingId: string;
  amountCents: number;
  /** Metadata stamped on the PaymentIntent so the webhook can correlate back. */
  metadata: Record<string, string>;
  /** Optional override — only used by tests. */
  stripe?: Stripe;
}

export interface CreatedBookingHoldIntent {
  clientSecret: string;
  paymentIntentId: string;
}

/**
 * Create a Stripe PaymentIntent with `capture_method: 'manual'` — this
 * authorizes a hold on the renter's card. Capture (the actual charge)
 * happens later in Story 5-4 when the operator marks the rental
 * completed, or on no-show flagging in Story 5-3.
 */
export async function createBookingHoldIntent(
  input: CreateBookingHoldIntentInput,
): Promise<CreatedBookingHoldIntent> {
  const client = input.stripe ?? getStripeServerClient();
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error(
      `createBookingHoldIntent: amountCents must be a positive integer, got ${input.amountCents}`,
    );
  }

  const intent = await client.paymentIntents.create({
    amount: input.amountCents,
    currency: "usd",
    capture_method: "manual",
    // PaymentElement picks the underlying method automatically (card,
    // Apple Pay, Google Pay all ride on the single card payment method
    // type + the PaymentRequest wallet).
    automatic_payment_methods: { enabled: true },
    metadata: {
      ...input.metadata,
      booking_id: input.bookingId,
      story: "3-5",
    },
  });

  if (!intent.client_secret) {
    throw new Error(
      `Stripe returned a PaymentIntent without client_secret (id=${intent.id})`,
    );
  }

  return {
    clientSecret: intent.client_secret,
    paymentIntentId: intent.id,
  };
}

/**
 * Cancel a PaymentIntent. Used to unwind a hold when the confirmation
 * transaction fails (e.g. booking_dates unique-violation race).
 * Swallows "already cancelled" errors so callers can safely retry.
 */
export async function cancelPaymentIntent(
  paymentIntentId: string,
  depsStripe?: Stripe,
): Promise<void> {
  const client = depsStripe ?? getStripeServerClient();
  try {
    await client.paymentIntents.cancel(paymentIntentId);
  } catch (error) {
    // If the intent is already canceled or captured, Stripe raises an
    // InvalidRequestError — nothing to do.
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return;
    }
    throw error;
  }
}

/**
 * Verify a webhook request against the shared webhook secret and return
 * the parsed event. Caller is responsible for reading the raw body as a
 * string before passing it here — Next.js route handlers must use
 * `await request.text()` (not `request.json()`) to preserve the exact
 * bytes Stripe signed.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  depsStripe?: Stripe,
  webhookSecret: string | undefined = process.env.STRIPE_WEBHOOK_SECRET,
): Stripe.Event {
  if (!webhookSecret) {
    throw new Error(
      "Missing STRIPE_WEBHOOK_SECRET — cannot verify webhook signatures.",
    );
  }
  const client = depsStripe ?? getStripeServerClient();
  return client.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
