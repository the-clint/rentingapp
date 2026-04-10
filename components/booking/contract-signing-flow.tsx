"use client";

/**
 * Renter contract signing client component (Story 3-4).
 *
 * Renders the plain-language summary card, an expandable "View Full Terms"
 * accordion carrying the full legal body, an "I agree" checkbox, and the
 * "I Agree & Sign" primary button. On success the button is replaced with
 * a green "Signed by (XXX) XXX-XXXX on [date/time]" confirmation and the
 * renter is routed to `/book/[listingId]/payment?bookingId=...` after a
 * short beat.
 *
 * Animation: the full-terms panel is a plain div with a `max-height`
 * transition (250ms). No animation library is used. `prefers-reduced-
 * motion` disables the transition via `motion-reduce:transition-none`.
 */

import { useCallback, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ContractSummary } from "@/lib/utils/contract-template";
import { signContract } from "@/lib/actions/contract-actions";
import { cn } from "@/lib/utils";

export interface ContractSigningFlowProps {
  listingId: string;
  contractId: string;
  summary: ContractSummary;
  body: string;
  listingName: string;
  renterPhoneE164: string;
}

function formatPhoneDisplay(e164: string): string {
  if (e164.startsWith("+1") && e164.length === 12) {
    return `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
  }
  return e164;
}

function formatSignedAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}

export function ContractSigningFlow({
  listingId,
  contractId,
  summary,
  body,
  listingName,
  renterPhoneE164,
}: ContractSigningFlowProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signedState, setSignedState] = useState<
    { bookingId: string; signedAt: string } | null
  >(null);

  const redirectTimerRef = useRef<number | null>(null);
  const panelId = useId();

  const handleSign = useCallback(async () => {
    if (!agreed || isSubmitting || signedState) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    const result = await signContract({ contractId, agreeChecked: true });
    setIsSubmitting(false);

    if (!result.success) {
      if (result.error.code === "SESSION_EXPIRED") {
        // Story 3-6: bounce through /verify with a returnTo so the
        // renter lands back on this contract screen after re-verify.
        const currentPath = window.location.pathname + window.location.search;
        const returnTo = encodeURIComponent(currentPath);
        router.push(`/book/${listingId}/verify?returnTo=${returnTo}`);
        return;
      }
      if (result.error.code === "BOOKING_CONFLICT") {
        setErrorMessage(
          "These dates were just booked. Please pick different dates.",
        );
      } else if (result.error.code === "CONTRACT_ALREADY_SIGNED") {
        setErrorMessage(
          "This contract is already signed. Redirecting you to payment.",
        );
      } else {
        setErrorMessage(
          result.error.message ??
            "Something went wrong signing the contract. Please try again.",
        );
      }
      return;
    }

    setSignedState({
      bookingId: result.data.bookingId,
      signedAt: result.data.signedAt,
    });

    redirectTimerRef.current = window.setTimeout(() => {
      router.push(
        `/book/${listingId}/payment?bookingId=${result.data.bookingId}`,
      );
    }, 1500);
  }, [agreed, contractId, isSubmitting, listingId, router, signedState]);

  const summaryLines = [
    summary.periodLine,
    summary.rateLine,
    summary.cancellationLine,
    summary.liabilityLine,
    summary.noShowLine,
    summary.pickupLine,
  ];

  return (
    <div className="flex flex-col gap-space-6">
      <div className="flex flex-col gap-space-3">
        <h1 className="text-h2 font-semibold text-neutral-900">
          Review &amp; sign your rental agreement
        </h1>
        <p className="text-base text-neutral-700">
          {listingName}
        </p>
      </div>

      <section
        aria-label="Contract summary"
        className="flex flex-col gap-space-3 rounded-lg border border-neutral-200 bg-white p-space-4"
      >
        <h2 className="text-h3 font-semibold text-neutral-900">
          What you&apos;re agreeing to
        </h2>
        <ul className="flex flex-col gap-space-2 text-base text-neutral-800">
          {summaryLines.map((line, i) => (
            <li key={i} className="flex gap-space-2">
              <span aria-hidden="true" className="text-primary-dark">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-space-2">
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className="flex items-center justify-between rounded-md border border-neutral-200 bg-neutral-50 px-space-3 py-space-2 text-base font-medium text-neutral-900 hover:bg-neutral-100"
          data-testid="view-full-terms"
        >
          <span>View Full Terms</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-4 w-4 transition-transform duration-[250ms] motion-reduce:transition-none",
              isExpanded && "rotate-180",
            )}
          />
        </button>
        <div
          id={panelId}
          role="region"
          aria-label="Full contract terms"
          data-testid="full-terms-panel"
          data-state={isExpanded ? "open" : "closed"}
          className={cn(
            "overflow-hidden transition-[max-height] duration-[250ms] ease-in-out motion-reduce:transition-none",
            isExpanded ? "max-h-[4000px]" : "max-h-0",
          )}
        >
          <pre className="mt-space-2 whitespace-pre-wrap rounded-md border border-neutral-200 bg-white p-space-4 font-mono text-sm text-neutral-900">
            {body}
          </pre>
        </div>
      </section>

      {signedState ? (
        <div
          role="status"
          className="flex items-center gap-space-3 rounded-md border border-success bg-success/10 px-space-4 py-space-3 text-success"
          data-testid="signed-confirmation"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-success text-white"
          >
            <Check className="h-5 w-5" />
          </span>
          <div className="flex flex-col">
            <span className="text-base font-semibold">
              Signed by {formatPhoneDisplay(renterPhoneE164)}
            </span>
            <span className="text-sm">
              on {formatSignedAt(signedState.signedAt)}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-space-3">
          <label className="flex items-start gap-space-2 text-base text-neutral-900">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-label="I agree to the terms of this rental agreement"
              data-testid="agree-checkbox"
              className="mt-1 h-4 w-4 rounded border-neutral-300"
            />
            <span>
              I have read and agree to the terms of this rental agreement.
            </span>
          </label>
          {errorMessage && (
            <p
              role="alert"
              className="text-sm text-destructive"
              data-testid="sign-error"
            >
              {errorMessage}
            </p>
          )}
          <Button
            type="button"
            onClick={() => void handleSign()}
            disabled={!agreed || isSubmitting}
            aria-describedby={panelId}
            data-testid="sign-button"
          >
            {isSubmitting ? "Signing…" : "I Agree & Sign"}
          </Button>
        </div>
      )}
    </div>
  );
}
