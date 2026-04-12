"use client";

/**
 * Operator booking detail view (Stories 5-2 / 5-3 / 5-4).
 *
 * Single client component for the `/bookings/[bookingId]` page. Renders
 * three panes:
 *
 *   1. Booking header (renter + listing + status + amount held).
 *   2. Signed contract pane with a collapsible body + download link.
 *   3. Check-in report pane (if the renter has submitted one).
 *
 * Plus the action bar at the bottom, which changes per lifecycle state:
 *   - `active` / `return_due` past start with no check-in: Flag as
 *      No-Show button.
 *   - `no_show` (already flagged): Capture Hold button.
 *   - `confirmed` or `completed` without a captured payment: Capture
 *     Payment button.
 *
 * All three actions route through the Server Actions in
 * `lib/actions/operator-booking-actions.ts`, which guard ownership
 * + eligibility server-side and run the Stripe captures.
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  captureHoldForNoShow,
  capturePaymentOnCompletion,
  flagNoShow,
} from "@/lib/actions/operator-booking-actions";
import type { OperatorBookingDetail } from "@/lib/services/operator-bookings";

export interface OperatorBookingDetailViewProps {
  booking: OperatorBookingDetail;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type DialogKind = "no-show" | "capture-no-show" | "capture-completion" | null;

export function OperatorBookingDetailView({
  booking,
}: OperatorBookingDetailViewProps) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCapture, setLastCapture] = useState<{
    captured: number;
    fees: number;
    net: number;
  } | null>(null);
  const router = useRouter();

  const canFlagNoShow =
    booking.status === "active" || booking.status === "return_due";
  const canCaptureNoShowHold =
    booking.status === "no_show" && booking.amountCapturedCents === 0;
  const canCaptureCompletion =
    (booking.status === "active" ||
      booking.status === "return_due" ||
      booking.status === "completed") &&
    booking.amountCapturedCents === 0;

  async function handleSubmit() {
    if (!dialog) return;
    setError(null);
    setSubmitting(true);
    let result;
    if (dialog === "no-show") {
      result = await flagNoShow(booking.bookingId);
    } else if (dialog === "capture-no-show") {
      result = await captureHoldForNoShow(booking.bookingId);
    } else {
      result = await capturePaymentOnCompletion(booking.bookingId);
    }
    setSubmitting(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    if (dialog !== "no-show" && "capturedCents" in result.data) {
      setLastCapture({
        captured: result.data.capturedCents,
        fees:
          result.data.stripeFeeCents +
          result.data.platformFeeCents +
          result.data.twilioCostCents,
        net: result.data.netOperatorCents,
      });
    }
    setDialog(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-space-5">
      <header className="flex flex-col gap-space-3">
        <Link
          href="/bookings"
          className="text-small font-medium text-primary-dark underline"
        >
          &larr; All bookings
        </Link>
        <div className="flex flex-col gap-space-3 rounded-lg border border-neutral-200 bg-white p-space-4 shadow-sm md:flex-row md:items-center">
          <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md bg-neutral-100">
            {booking.heroPhotoUrl ? (
              <Image
                src={booking.heroPhotoUrl}
                alt={booking.listingName}
                fill
                sizes="80px"
                className="object-cover"
                unoptimized
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-h2 font-semibold text-neutral-900">
              {booking.listingName}
            </h1>
            <p className="text-small text-neutral-700">
              {booking.renterDisplayName}
              {booking.renterPhone
                ? ` · ${booking.renterPhone}`
                : ""}
            </p>
            <p className="text-small text-neutral-700">
              {formatDate(booking.startDate)} &rarr;{" "}
              {formatDate(booking.endDate)}
            </p>
          </div>
          <div className="flex flex-col items-start gap-space-1 md:items-end">
            <span
              className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
                "bg-neutral-200 text-neutral-800",
              )}
              data-testid="booking-detail-status"
            >
              {booking.statusLabel}
            </span>
            <p className="text-small font-semibold tabular-nums text-neutral-900">
              {booking.amountCapturedCents > 0
                ? `${formatUsd(booking.amountCapturedCents)} captured`
                : `${formatUsd(booking.totalCents)} held`}
            </p>
          </div>
        </div>
      </header>

      <section
        className="flex flex-col gap-space-3 rounded-lg border border-neutral-200 bg-white p-space-4"
        data-testid="booking-detail-contract"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-h3 font-semibold text-neutral-900">
            Signed contract
          </h2>
          {booking.hasContract && booking.contractSignedAt ? (
            <span className="text-xs font-medium text-neutral-700">
              Signed {formatDateTime(booking.contractSignedAt)}
            </span>
          ) : null}
        </div>
        {booking.hasContract && booking.contractBody ? (
          <details className="rounded-md border border-neutral-200 bg-neutral-50 p-space-3">
            <summary className="cursor-pointer text-small font-medium text-neutral-900">
              View contract body
            </summary>
            <pre className="mt-space-2 whitespace-pre-wrap text-xs text-neutral-800">
              {booking.contractBody}
            </pre>
          </details>
        ) : (
          <p className="text-small text-neutral-700">
            No signed contract on file.
          </p>
        )}
        <p className="text-xs text-neutral-600">
          This contract is immutable.
          {" "}
          <a
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(booking.contractBody ?? "")}`}
            download={`contract-${booking.bookingId}.txt`}
            className="underline"
          >
            Download
          </a>
        </p>
      </section>

      {booking.checkInSubmitted ? (
        <section
          className="flex flex-col gap-space-3 rounded-lg border border-neutral-200 bg-white p-space-4"
          data-testid="booking-detail-check-in"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-h3 font-semibold text-neutral-900">
              Check-in report
            </h2>
            <span className="text-xs font-medium text-neutral-700">
              {formatDateTime(booking.checkInSubmittedAt)}
            </span>
          </div>
          <p className="text-small text-neutral-800">
            Condition:{" "}
            <strong className="capitalize">
              {booking.checkInCondition ?? "—"}
            </strong>
          </p>
          {booking.checkInComments ? (
            <p className="whitespace-pre-wrap text-small text-neutral-800">
              {booking.checkInComments}
            </p>
          ) : null}
          {booking.checkInPhotoUrls.length > 0 ? (
            <ul className="grid grid-cols-3 gap-space-2">
              {booking.checkInPhotoUrls.map((url) => (
                <li key={url}>
                  <Image
                    src={url}
                    alt="Check-in photo"
                    width={160}
                    height={160}
                    className="h-24 w-full rounded-md object-cover"
                    unoptimized
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-space-3 rounded-lg border border-neutral-200 bg-white p-space-4">
        <h2 className="text-h3 font-semibold text-neutral-900">
          Pickup instructions
        </h2>
        <p className="text-small text-neutral-800">{booking.pickupLocation}</p>
      </section>

      {lastCapture ? (
        <div
          className="rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10 p-space-3"
          data-testid="booking-detail-capture-success"
        >
          <p className="text-small font-semibold text-[hsl(var(--success))]">
            ✓ Captured {formatUsd(lastCapture.captured)}
          </p>
          <p className="text-xs text-neutral-800">
            Fees: {formatUsd(lastCapture.fees)} &middot; Net:{" "}
            <strong>{formatUsd(lastCapture.net)}</strong>
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : null}

      <section className="flex flex-wrap gap-space-3">
        {canFlagNoShow ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setDialog("no-show")}
            data-testid="booking-flag-no-show"
          >
            Flag as No-Show
          </Button>
        ) : null}
        {canCaptureNoShowHold ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDialog("capture-no-show")}
            data-testid="booking-capture-no-show"
          >
            Capture Hold
          </Button>
        ) : null}
        {canCaptureCompletion ? (
          <Button
            type="button"
            variant="default"
            onClick={() => setDialog("capture-completion")}
            data-testid="booking-capture-payment"
          >
            Capture Payment
          </Button>
        ) : null}
      </section>

      {dialog ? (
        <ConfirmDialog
          kind={dialog}
          booking={booking}
          submitting={submitting}
          onConfirm={handleSubmit}
          onCancel={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  kind,
  booking,
  submitting,
  onConfirm,
  onCancel,
}: {
  kind: Exclude<DialogKind, null>;
  booking: OperatorBookingDetail;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const copy = {
    "no-show": {
      title: "Flag this booking as a no-show?",
      body: "Per the signed contract, you can capture the held funds after flagging. This does NOT charge the renter yet.",
      cta: "Confirm No-Show",
      variant: "destructive" as const,
    },
    "capture-no-show": {
      title: `Capture ${formatUsd(booking.totalCents)} from held funds?`,
      body: "This charges the renter the full held amount per the no-show clause in the signed contract.",
      cta: "Capture Hold",
      variant: "destructive" as const,
    },
    "capture-completion": {
      title: `Capture ${formatUsd(booking.totalCents)} for completed rental?`,
      body: "This captures the payment hold and records platform/Stripe fees.",
      cta: "Capture Payment",
      variant: "default" as const,
    },
  }[kind];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-space-4"
      role="dialog"
      aria-modal="true"
      data-testid="booking-confirm-dialog"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-space-5 shadow-lg">
        <h3 className="text-h3 font-semibold text-neutral-900">
          {copy.title}
        </h3>
        <p className="mt-space-2 text-small text-neutral-800">{copy.body}</p>
        <div className="mt-space-4 flex justify-end gap-space-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={copy.variant}
            onClick={onConfirm}
            disabled={submitting}
            data-testid="booking-confirm-dialog-submit"
          >
            {submitting ? "Working…" : copy.cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
