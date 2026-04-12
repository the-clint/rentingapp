/**
 * Booking flow step indicator (Story 3-3).
 *
 * A horizontal row of labeled steps with a filled progress state.
 * Used by every step of the renter booking flow (Verify, Contract, Payment,
 * Confirmed) so the renter always knows where they are.
 */

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const BOOKING_STEPS = [
  "dates",
  "verify",
  "contract",
  "payment",
  "confirmed",
] as const;

export type BookingStep = (typeof BOOKING_STEPS)[number];

const LABELS: Record<BookingStep, string> = {
  dates: "Dates",
  verify: "Verify",
  contract: "Contract",
  payment: "Payment",
  confirmed: "Confirmed",
};

export interface BookingStepIndicatorProps {
  currentStep: BookingStep;
}

export function BookingStepIndicator({
  currentStep,
}: BookingStepIndicatorProps) {
  const currentIndex = BOOKING_STEPS.indexOf(currentStep);

  return (
    <nav
      aria-label="Booking progress"
      data-testid="booking-step-indicator"
      className="flex w-full items-center justify-between gap-space-2"
    >
      {BOOKING_STEPS.map((step, i) => {
        const isComplete = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div
            key={step}
            className="flex flex-1 flex-col items-center gap-space-1"
            data-step={step}
            data-state={
              isCurrent ? "current" : isComplete ? "complete" : "pending"
            }
            aria-current={isCurrent ? "step" : undefined}
          >
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold",
                isCurrent &&
                  "border-primary bg-primary text-primary-foreground",
                isComplete &&
                  "border-primary bg-primary text-primary-foreground",
                !isCurrent &&
                  !isComplete &&
                  "border-neutral-300 bg-white text-neutral-500",
              )}
            >
              {isComplete ? (
                <Check className="h-3 w-3" aria-hidden="true" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={cn(
                "text-[11px] font-medium uppercase tracking-wide",
                isCurrent ? "text-neutral-900" : "text-neutral-500",
              )}
            >
              {LABELS[step]}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
