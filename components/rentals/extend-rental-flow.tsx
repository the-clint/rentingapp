"use client";

/**
 * ExtendRentalFlow — client component for Story 4-2.
 *
 * Three-step flow:
 *   Step 1 ("select"):    pick extension days (1..maxExtendDays) via a
 *                         button group, show live cost math + new end
 *                         date, tap "Confirm extension" to proceed.
 *   Step 2 ("authorize"): Stripe PaymentElement for the delta hold.
 *                         Mirrors the Story 3-5 `PaymentHoldForm`
 *                         pattern — Elements wraps a memoized Stripe.js
 *                         promise keyed on the publishable key, a
 *                         confirm button triggers `stripe.confirmPayment`
 *                         followed by `commitExtension`.
 *   Step 3 ("done"):      success state with "Extended!" + new return
 *                         date + delta held + Back to rentals link.
 *
 * Server-Action errors map to inline `role="alert"` messages; the
 * SESSION_EXPIRED branch bounces to `/rentals/verify?returnTo=...`.
 */

import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  commitExtension,
  prepareExtension,
} from "@/lib/actions/extension-actions";

export interface ExtendRentalFlowProps {
  bookingId: string;
  listingName: string;
  currentEndDate: string;
  currentTotalCents: number;
  dailyRateCents: number;
  maxExtendDays: number;
  publishableKey: string;
  initialExtendDays?: number;
}

type Step = "select" | "authorize" | "done";

interface PreparedState {
  clientSecret: string;
  amountCents: number;
  newEndDate: string;
  extendDays: number;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateReadable(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const stripePromiseCache = new Map<string, Promise<Stripe | null>>();
function getStripePromise(key: string): Promise<Stripe | null> {
  let p = stripePromiseCache.get(key);
  if (!p) {
    p = loadStripe(key);
    stripePromiseCache.set(key, p);
  }
  return p;
}

export function ExtendRentalFlow(props: ExtendRentalFlowProps) {
  const [step, setStep] = useState<Step>("select");
  const [extendDays, setExtendDays] = useState<number>(
    Math.min(
      props.maxExtendDays,
      Math.max(1, props.initialExtendDays ?? 1),
    ),
  );
  const [prepared, setPrepared] = useState<PreparedState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const dayOptions = useMemo(
    () =>
      Array.from({ length: 4 }, (_, i) => i + 1).map((n) => ({
        days: n,
        disabled: n > props.maxExtendDays,
      })),
    [props.maxExtendDays],
  );

  const deltaCents = props.dailyRateCents * extendDays;
  const newEndDate = addDaysIso(props.currentEndDate, extendDays);
  const newTotalCents = props.currentTotalCents + deltaCents;

  async function handleConfirmSelection() {
    setError(null);
    setSubmitting(true);
    const result = await prepareExtension(props.bookingId, extendDays);
    setSubmitting(false);
    if (!result.success) {
      if (result.error.code === "EXTENSION_UNAUTHENTICATED") {
        const returnTo = `/rentals/${props.bookingId}/extend`;
        router.push(
          `/rentals/verify?returnTo=${encodeURIComponent(returnTo)}`,
        );
        return;
      }
      setError(result.error.message);
      return;
    }
    setPrepared({
      clientSecret: result.data.clientSecret,
      amountCents: result.data.amountCents,
      newEndDate: result.data.newEndDate,
      extendDays: result.data.extendDays,
    });
    setStep("authorize");
  }

  if (step === "select") {
    return (
      <div
        className="flex flex-col gap-space-4"
        data-testid="extend-flow-select"
      >
        <div className="rounded-md border border-neutral-200 bg-neutral-100 p-space-3">
          <p className="text-small text-neutral-800">
            <strong>{props.listingName}</strong>
          </p>
          <p className="text-small text-neutral-700">
            Current return: {formatDateReadable(props.currentEndDate)}
          </p>
          <p className="text-small text-neutral-700">
            Current total held: {formatUsd(props.currentTotalCents)}
          </p>
        </div>

        <div className="flex flex-col gap-space-2">
          <p className="text-small font-medium text-neutral-900">
            How many additional days?
          </p>
          <div
            role="group"
            aria-label="Extension days"
            className="grid grid-cols-4 gap-space-2"
          >
            {dayOptions.map((opt) => {
              const selected = opt.days === extendDays && !opt.disabled;
              return (
                <button
                  key={opt.days}
                  type="button"
                  disabled={opt.disabled}
                  data-testid={`extend-days-${opt.days}`}
                  aria-pressed={selected}
                  onClick={() => setExtendDays(opt.days)}
                  className={cn(
                    "rounded-md border px-space-2 py-space-2 text-small font-medium",
                    selected
                      ? "border-primary bg-primary/10 text-primary-dark"
                      : "border-neutral-300 bg-white text-neutral-800",
                    opt.disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  +{opt.days} day{opt.days > 1 ? "s" : ""}
                  {opt.disabled ? (
                    <span className="sr-only"> (unavailable)</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {props.maxExtendDays < 4 ? (
            <p className="text-xs text-neutral-600">
              Only {props.maxExtendDays} day
              {props.maxExtendDays === 1 ? "" : "s"} available (based on
              the remaining maintenance buffer).
            </p>
          ) : null}
        </div>

        <div className="rounded-md border border-neutral-200 bg-white p-space-3 text-small text-neutral-800">
          <p data-testid="extend-cost-math">
            {formatUsd(props.dailyRateCents)}/day &times; {extendDays}{" "}
            additional day{extendDays > 1 ? "s" : ""} ={" "}
            <strong>{formatUsd(deltaCents)} more</strong>
          </p>
          <p>
            New return date:{" "}
            <strong data-testid="extend-new-end">
              {formatDateReadable(newEndDate)}
            </strong>
          </p>
          <p>
            New total held: <strong>{formatUsd(newTotalCents)}</strong>
          </p>
        </div>

        {error ? (
          <p role="alert" className="text-small text-destructive">
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          disabled={submitting || props.maxExtendDays < 1}
          onClick={handleConfirmSelection}
          data-testid="extend-confirm-selection"
        >
          {submitting ? "Preparing…" : "Confirm extension"}
        </Button>

        <Link
          href="/rentals"
          className="text-small font-medium text-primary-dark underline"
        >
          &larr; Back to My Rentals
        </Link>
      </div>
    );
  }

  if (step === "authorize" && prepared) {
    return (
      <ExtendAuthorize
        bookingId={props.bookingId}
        publishableKey={props.publishableKey}
        prepared={prepared}
        onSuccess={(newEndDate) => {
          setPrepared({ ...prepared, newEndDate });
          setStep("done");
        }}
      />
    );
  }

  // done
  return (
    <div
      className="flex flex-col gap-space-4"
      data-testid="extend-flow-done"
    >
      <div className="rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 p-space-4">
        <p className="text-base font-semibold text-[hsl(var(--success))]">
          Rental extended!
        </p>
        <p className="text-small text-neutral-800">
          New return date:{" "}
          <strong>
            {formatDateReadable(prepared?.newEndDate ?? newEndDate)}
          </strong>
        </p>
        <p className="text-small text-neutral-800">
          Additional hold placed:{" "}
          <strong>{formatUsd(prepared?.amountCents ?? deltaCents)}</strong>
        </p>
      </div>
      <Button asChild>
        <Link href="/rentals" data-testid="extend-back-to-rentals">
          Back to My Rentals
        </Link>
      </Button>
    </div>
  );
}

interface ExtendAuthorizeProps {
  bookingId: string;
  publishableKey: string;
  prepared: PreparedState;
  onSuccess: (newEndDate: string) => void;
}

function ExtendAuthorize(props: ExtendAuthorizeProps) {
  const stripePromise = useMemo(
    () => getStripePromise(props.publishableKey),
    [props.publishableKey],
  );
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: props.prepared.clientSecret,
        appearance: { theme: "stripe" },
      }}
    >
      <InnerExtendAuthorize {...props} />
    </Elements>
  );
}

function InnerExtendAuthorize({
  bookingId,
  prepared,
  onSuccess,
}: ExtendAuthorizeProps) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReady = Boolean(stripe && elements);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setSubmitting(true);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/rentals/${bookingId}/extend`,
      },
      redirect: "if_required",
    });

    if (stripeError) {
      setError(
        "Payment issue — please update your payment method or contact the operator.",
      );
      setSubmitting(false);
      return;
    }

    const commitResult = await commitExtension({
      bookingId,
      extendDays: prepared.extendDays,
    });
    if (!commitResult.success) {
      if (commitResult.error.code === "SESSION_EXPIRED") {
        const returnTo = `/rentals/${bookingId}/extend`;
        router.push(
          `/rentals/verify?returnTo=${encodeURIComponent(returnTo)}`,
        );
        return;
      }
      if (commitResult.error.code === "EXTENSION_CONFLICT") {
        setError(
          "Those dates were just booked. Please try a shorter extension.",
        );
      } else {
        setError(
          commitResult.error.message ??
            "Could not extend your rental. Please try again.",
        );
      }
      setSubmitting(false);
      return;
    }

    onSuccess(commitResult.data.newEndDate);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-space-4"
      aria-label="Extension hold form"
      data-testid="extend-flow-authorize"
    >
      <div className="rounded-md border border-neutral-200 bg-neutral-100 p-space-3">
        <p className="text-body text-neutral-900">
          We&rsquo;ll place an additional hold of{" "}
          <strong>{formatUsd(prepared.amountCents)}</strong>.
        </p>
      </div>

      <div data-testid="extend-payment-element">
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
        data-testid="extend-authorize-button"
      >
        {submitting
          ? "Authorizing hold…"
          : `Authorize extra hold (${formatUsd(prepared.amountCents)})`}
      </Button>
    </form>
  );
}
