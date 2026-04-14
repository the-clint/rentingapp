"use client";

/**
 * CancelBookingFlow — client component for Story 4-3.
 *
 * Two steps (three visual states):
 *   Step "review":  rental summary + outcome copy (refund OR no refund)
 *                   + destructive "Confirm cancellation" button.
 *   Drift state:    OUTCOME_DRIFT error — the policy flipped under the
 *                   user (they sat on the page long enough to cross the
 *                   48h boundary). We show a "Refresh to see the updated
 *                   policy" button that `router.refresh()`'s the page,
 *                   which re-runs the Server Component + preview call.
 *   Step "done":    green "Cancelled" card with a "Back to rentals"
 *                   link.
 *
 * Prop `preview` is the `previewCancellation(...)` result computed by
 * the page Server Component. It's passed as a plain prop so the client
 * side doesn't need to re-fetch on mount — and the `acknowledgedOutcome`
 * passed to `confirmCancellation` comes directly from this preview, so
 * the drift check on the server can compare them.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { confirmCancellation } from "@/lib/actions/cancellation-actions";
import type { CancellationOutcome } from "@/lib/services/cancellation-policy";

export interface CancelBookingFlowProps {
  bookingId: string;
  listingName: string;
  startDate: string;
  endDate: string;
  amountCents: number;
  outcome: CancellationOutcome;
  hoursUntilStart: number;
}

type Step = "review" | "done";

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
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

export function CancelBookingFlow(props: CancelBookingFlowProps) {
  const [step, setStep] = useState<Step>("review");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drift, setDrift] = useState(false);
  const router = useRouter();

  async function handleConfirm() {
    setError(null);
    setDrift(false);
    setSubmitting(true);
    const result = await confirmCancellation(props.bookingId, {
      acknowledgedOutcome: props.outcome,
    });
    setSubmitting(false);

    if (!result.success) {
      if (result.error.code === "SESSION_EXPIRED") {
        const returnTo = `/rentals/${props.bookingId}/cancel`;
        router.push(
          `/rentals/verify?returnTo=${encodeURIComponent(returnTo)}`,
        );
        return;
      }
      if (result.error.code === "OUTCOME_DRIFT") {
        setDrift(true);
        return;
      }
      setError(result.error.message ?? "Could not cancel your rental.");
      return;
    }

    setStep("done");
  }

  function handleRefresh() {
    setDrift(false);
    router.refresh();
  }

  if (step === "done") {
    return (
      <div
        className="flex flex-col gap-space-4"
        data-testid="cancel-flow-done"
      >
        <div className="rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 p-space-4">
          <p
            className="text-base font-semibold text-[hsl(var(--success))]"
            data-testid="cancel-flow-success"
          >
            ✓ Cancelled
          </p>
          <p className="text-small text-neutral-900">
            {props.outcome === "refund"
              ? `Your hold of ${formatUsd(props.amountCents)} will be released within a few business days.`
              : `The hold of ${formatUsd(props.amountCents)} was captured per the within-48-hour cancellation policy.`}
          </p>
        </div>
        <Button asChild>
          <Link href="/rentals" data-testid="cancel-back-to-rentals">
            Back to My Rentals
          </Link>
        </Button>
      </div>
    );
  }

  const isRefund = props.outcome === "refund";

  return (
    <div
      className="flex flex-col gap-space-4"
      data-testid="cancel-flow-review"
    >
      <div className="rounded-md border border-border bg-neutral-100 p-space-3">
        <p className="text-small text-neutral-900">
          <strong>{props.listingName}</strong>
        </p>
        <p className="text-small text-neutral-700">
          {formatDateReadable(props.startDate)} &rarr;{" "}
          {formatDateReadable(props.endDate)}
        </p>
        <p className="text-small text-neutral-700">
          Current hold: {formatUsd(props.amountCents)}
        </p>
      </div>

      {isRefund ? (
        <div
          className="rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 p-space-3"
          data-testid="cancel-outcome-refund"
        >
          <p className="text-small font-medium text-neutral-900">
            Full refund &mdash; hold will be released
          </p>
          <p className="text-small text-neutral-900">
            You&rsquo;re cancelling more than 48 hours before the rental
            starts, so your hold of{" "}
            <strong>{formatUsd(props.amountCents)}</strong> will be
            released in full.
          </p>
        </div>
      ) : (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 p-space-3"
          data-testid="cancel-outcome-hold-captured"
          role="note"
        >
          <p className="text-small font-medium text-amber-900">
            Per the cancellation policy, no refund within 48 hours.
          </p>
          <p className="text-small text-amber-900">
            Cancelling now means the hold of{" "}
            <strong>{formatUsd(props.amountCents)}</strong> will be
            charged (non-refundable).
          </p>
        </div>
      )}

      {drift ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-space-3"
          data-testid="cancel-drift-error"
        >
          <p className="text-small font-medium text-destructive">
            The cancellation policy changed.
          </p>
          <p className="text-small text-destructive">
            You crossed the 48-hour boundary while this page was open.
            Refresh to see the updated policy before confirming.
          </p>
          <div className="mt-space-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              data-testid="cancel-refresh-button"
            >
              Refresh to see the updated policy
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="text-small text-destructive"
          data-testid="cancel-error"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        variant="destructive"
        disabled={submitting || drift}
        onClick={handleConfirm}
        data-testid="cancel-confirm-button"
      >
        {submitting ? "Cancelling…" : "Confirm cancellation"}
      </Button>

      <Link
        href="/rentals"
        className="text-small font-medium text-primary-dark underline"
        data-testid="cancel-back-link"
      >
        &larr; Back to My Rentals
      </Link>
    </div>
  );
}
