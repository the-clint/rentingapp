/**
 * Stripe webhook route handler (Story 3-5).
 *
 * Route: POST /api/webhooks/stripe
 *
 * Responsibilities:
 *   1. Read the raw body via `request.text()` (NEVER `request.json()` —
 *      Stripe's signature verifies against the exact bytes).
 *   2. Verify the signature with `verifyWebhookSignature`. Reject
 *      unsigned / mismatched requests with HTTP 400.
 *   3. Dedupe via the `stripe_webhook_events` table (unique on
 *      `stripe_event_id`) — if a duplicate event id arrives we 200-OK
 *      immediately without side effects.
 *   4. Process a small allowlist of event types. Story 3-5 only cares
 *      about `payment_intent.payment_failed` (log-level no-op — the
 *      inline confirm path already reports failures to the renter) and
 *      `payment_intent.canceled` (also a no-op beyond dedupe). Other
 *      event types are 200-OK'd without side effects to avoid Stripe
 *      retrying.
 *
 * Future stories (5-3 capture on no-show, 5-4 capture on completion,
 * 4-3 release on cancel) will add more branches to the switch.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/services/stripe";

// Note: Next.js 16 + cacheComponents makes `runtime` / `dynamic` route
// segment config incompatible. The Node.js runtime is the default for
// route handlers, and POST requests are never cached, so we rely on
// those defaults instead of explicit exports.

export async function POST(request: NextRequest): Promise<NextResponse> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { error: "Failed to read request body" },
      { status: 400 },
    );
  }

  let event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Webhook signature verification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Idempotency dedupe.
  const admin = createAdminClient();
  const { error: insertError } = await admin
    .from("stripe_webhook_events")
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    });

  if (insertError) {
    // 23505 = unique_violation — replay of an already-processed event.
    const code = (insertError as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json(
      { error: insertError.message ?? "Failed to record webhook event" },
      { status: 500 },
    );
  }

  switch (event.type) {
    case "payment_intent.payment_failed": {
      // The inline payment flow already reports failures to the renter
      // via `confirmBookingAfterPayment`. Log + move on — no DB update.
      console.info(
        "[stripe-webhook] payment_intent.payment_failed",
        event.id,
      );
      break;
    }
    case "payment_intent.canceled": {
      // Cancel is a no-op beyond dedupe. Story 4-3 will extend this to
      // release holds on renter cancel.
      break;
    }
    default: {
      // Unknown / not-yet-handled event types. 200-OK so Stripe does
      // not retry.
      break;
    }
  }

  return NextResponse.json({ received: true });
}
