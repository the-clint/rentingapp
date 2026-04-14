"use client";

/**
 * Sticky bottom bar for the renter booking flow (Story 3-2).
 *
 * Slides up from the bottom once the renter picks a start date. Displays the
 * selected date range, total days, and a 300ms animated total-cost counter.
 * The "Book Now" CTA is disabled until both start and end dates are chosen.
 *
 * Story 3-3 will wire the CTA to the phone-OTP screen; for Story 3-2 the
 * button calls the `onBookNow` prop which the parent can stub out.
 */

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { fromDateKey, type DateKey } from "@/lib/utils/date-range";

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatRangeLabel(
  startDate: DateKey | null,
  endDate: DateKey | null,
): string {
  if (!startDate) return "Select dates";
  const startLabel = SHORT_DATE_FORMATTER.format(fromDateKey(startDate));
  if (!endDate) return `${startLabel} – Select return date`;
  const endLabel = SHORT_DATE_FORMATTER.format(fromDateKey(endDate));
  return `${startLabel} – ${endLabel}`;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export interface BookingStickyBarProps {
  startDate: DateKey | null;
  endDate: DateKey | null;
  totalDays: number;
  totalCents: number;
  isVisible: boolean;
  onBookNow: () => void;
}

const ANIMATION_MS = 300;

function useAnimatedCounter(target: number, durationMs: number): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      // Ease-out-quad.
      const eased = 1 - (1 - t) * (1 - t);
      const value = Math.round(from + (to - from) * eased);
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [target, durationMs]);

  return display;
}

export function BookingStickyBar({
  startDate,
  endDate,
  totalDays,
  totalCents,
  isVisible,
  onBookNow,
}: BookingStickyBarProps) {
  const animatedCents = useAnimatedCounter(totalCents, ANIMATION_MS);
  const canBook = Boolean(startDate && endDate && totalDays > 0);
  const rangeLabel = formatRangeLabel(startDate, endDate);
  const daysLabel =
    totalDays === 0
      ? ""
      : totalDays === 1
        ? "1 day"
        : `${totalDays} days`;

  return (
    <div
      data-testid="booking-sticky-bar"
      data-visible={isVisible ? "true" : "false"}
      aria-hidden={!isVisible}
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-space-4 py-space-4 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-out ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="mx-auto flex max-w-[480px] items-center justify-between gap-space-4">
        <div className="flex flex-col">
          <span className="text-body-medium font-semibold text-neutral-900">
            {rangeLabel}
          </span>
          {daysLabel || totalCents > 0 ? (
            <span className="text-small text-neutral-700">
              {daysLabel}
              {daysLabel && totalCents > 0 ? " · " : ""}
              {totalCents > 0 ? formatDollars(animatedCents) : ""}
            </span>
          ) : (
            <span className="text-small text-neutral-700">
              Select return date
            </span>
          )}
        </div>
        <Button
          type="button"
          disabled={!canBook}
          onClick={onBookNow}
          className="min-w-[120px]"
        >
          Book Now
        </Button>
      </div>
    </div>
  );
}
