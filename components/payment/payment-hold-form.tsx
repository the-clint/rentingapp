"use client";

/**
 * PaymentHoldForm — client component that drives the Stripe hold flow
 * (Story 3-5).
 *
 * Props contain the server-issued PaymentIntent client_secret +
 * publishable key. We mount `<Elements>` with the publishable key +
 * client_secret, render a big Apple/Google Pay `<PaymentRequestButtonElement>`
 * at the top (hidden if the browser cannot do PaymentRequest), a
 * divider, and a `<PaymentElement>` below for manual card entry.
 *
 * On submit we call `stripe.confirmPayment` with
 * `redirect: 'if_required'` — a manual-capture PaymentIntent never
 * needs a 3DS redirect in the common path, so we stay on the same
 * route and then call the `confirmBookingAfterPayment` Server Action
 * to flip the booking to confirmed. On success we navigate to
 * `/book/[listingId]/confirmed?bookingId=...` immediately.
 */

import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  PaymentRequestButtonElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { confirmBookingAfterPayment } from "@/lib/actions/payment-actions";

export interface PaymentHoldFormProps {
  listingId: string;
  bookingId: string;
  clientSecret: string;
  publishableKey: string;
  amountCents: number;
  listingName: string;
}

// Cache the Stripe.js promise across re-renders of a single publishable key.
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();
function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  let p = stripePromiseCache.get(publishableKey);
  if (!p) {
    p = loadStripe(publishableKey);
    stripePromiseCache.set(publishableKey, p);
  }
  return p;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PaymentHoldForm(props: PaymentHoldFormProps) {
  const stripePromise = useMemo(
    () => getStripePromise(props.publishableKey),
    [props.publishableKey],
  );

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: props.clientSecret,
        appearance: { theme: "stripe" },
      }}
    >
      <InnerPaymentHoldForm {...props} />
    </Elements>
  );
}

interface PaymentRequestShape {
  canMakePayment: () => Promise<{ applePay?: boolean; googlePay?: boolean } | null>;
  on: (event: string, cb: (ev: { complete: (s: string) => void }) => void) => void;
}

function InnerPaymentHoldForm({
  listingId,
  bookingId,
  amountCents,
  listingName,
}: PaymentHoldFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();

  const [paymentRequest, setPaymentRequest] = useState<PaymentRequestShape | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReady = Boolean(stripe && elements);

  // Wire up Apple/Google Pay via the PaymentRequest API.
  useEffect(() => {
    if (!stripe) return;
    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: listingName, amount: amountCents },
      requestPayerName: true,
    });
    pr.canMakePayment().then((result) => {
      if (result) {
        setPaymentRequest(pr as unknown as PaymentRequestShape);
      }
    });
  }, [stripe, amountCents, listingName]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setSubmitting(true);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/book/${listingId}/confirmed?bookingId=${bookingId}`,
      },
      redirect: "if_required",
    });

    if (stripeError) {
      setError("Payment failed — please try another method.");
      setSubmitting(false);
      return;
    }

    const confirmResult = await confirmBookingAfterPayment(bookingId);
    if (!confirmResult.success) {
      if (confirmResult.error.code === "SESSION_EXPIRED") {
        // Story 3-6: Supabase cookie expired mid-flow. Bounce the
        // renter through the OTP re-verify screen and back to this
        // payment page with a whitelisted returnTo.
        const currentPath = window.location.pathname + window.location.search;
        const returnTo = encodeURIComponent(currentPath);
        router.push(`/book/${listingId}/verify?returnTo=${returnTo}`);
        return;
      }
      if (confirmResult.error.code === "BOOKING_CONFLICT") {
        setError(
          "Sorry, these dates were just booked. Please select different dates.",
        );
      } else {
        setError(
          confirmResult.error.message ??
            "Could not confirm your booking. Please try again.",
        );
      }
      setSubmitting(false);
      return;
    }

    router.push(confirmResult.data.redirectTo);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-space-4"
      aria-label="Payment hold form"
    >
      <div className="rounded-md border border-border bg-neutral-100 p-space-3">
        <p className="text-body text-neutral-900">
          We&rsquo;ll hold <strong>{formatUsd(amountCents)}</strong> — you&rsquo;re only
          charged when the rental completes.
        </p>
      </div>

      {paymentRequest ? (
        <div data-testid="payment-request-button">
          <PaymentRequestButtonElement
            options={{
              // @ts-expect-error — runtime shape is PaymentRequest
              paymentRequest,
              style: { paymentRequestButton: { height: "48px" } },
            }}
          />
          <div className="relative my-space-3 text-center">
            <span className="bg-background px-space-2 text-small text-neutral-500">
              or pay with card
            </span>
            <div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-neutral-300" />
          </div>
        </div>
      ) : null}

      <div data-testid="payment-element">
        <PaymentElement />
      </div>

      {error ? (
        <p role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={!isReady || submitting}
        data-testid="confirm-hold-button"
      >
        {submitting
          ? "Authorizing hold…"
          : `Confirm hold (${formatUsd(amountCents)})`}
      </Button>
    </form>
  );
}
