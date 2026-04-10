"use client";

/**
 * Renter booking date-range selection hook.
 *
 * The source of truth is the URL query string (`?start=YYYY-MM-DD&end=YYYY-MM-DD`)
 * so the selection survives a refresh and is trivially shareable. Story 3-6
 * will decide whether to back this with Zustand for multi-step persistence;
 * for Story 3-2 we keep it URL-only.
 *
 * Selection rules:
 *   - First pick sets `start` and clears `end`.
 *   - Second pick: if it's AFTER the current start, sets `end`; if it's
 *     BEFORE the current start, resets `start` to the new pick and clears
 *     `end`; if it equals the current start, clears the selection.
 *   - `reset()` clears both.
 *
 * The hook also exposes `totalDays` (inclusive) and a `totalCents` calculator
 * given a daily rate.
 */

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { DateKey } from "@/lib/utils/date-range";
import { enumerateDateRange } from "@/lib/utils/date-range";

export interface BookingDateSelection {
  startDate: DateKey | null;
  endDate: DateKey | null;
  selectedDates: DateKey[];
  totalDays: number;
  pickDate: (date: DateKey) => void;
  reset: () => void;
  setRange: (start: DateKey | null, end: DateKey | null) => void;
  totalCentsFor: (dailyRateCents: number) => number;
}

function isValidDateKey(value: string | null): value is DateKey {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function useBookingDateSelection(): BookingDateSelection {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const startDate = isValidDateKey(startParam) ? startParam : null;
  const endDate = isValidDateKey(endParam) ? endParam : null;

  const selectedDates = useMemo<DateKey[]>(() => {
    if (!startDate) return [];
    if (!endDate) return [startDate];
    return enumerateDateRange(startDate, endDate);
  }, [startDate, endDate]);

  const totalDays = selectedDates.length;

  const writeParams = useCallback(
    (next: { start: DateKey | null; end: DateKey | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.start) {
        params.set("start", next.start);
      } else {
        params.delete("start");
      }
      if (next.end) {
        params.set("end", next.end);
      } else {
        params.delete("end");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const pickDate = useCallback(
    (date: DateKey) => {
      if (!startDate) {
        writeParams({ start: date, end: null });
        return;
      }
      if (!endDate) {
        if (date === startDate) {
          writeParams({ start: null, end: null });
          return;
        }
        if (date < startDate) {
          // Picked a date earlier than the start: treat as a new start.
          writeParams({ start: date, end: null });
          return;
        }
        writeParams({ start: startDate, end: date });
        return;
      }
      // Both ends already set: a new tap starts a fresh range.
      writeParams({ start: date, end: null });
    },
    [startDate, endDate, writeParams],
  );

  const reset = useCallback(() => {
    writeParams({ start: null, end: null });
  }, [writeParams]);

  const setRange = useCallback(
    (start: DateKey | null, end: DateKey | null) => {
      writeParams({ start, end });
    },
    [writeParams],
  );

  const totalCentsFor = useCallback(
    (dailyRateCents: number) => totalDays * dailyRateCents,
    [totalDays],
  );

  return {
    startDate,
    endDate,
    selectedDates,
    totalDays,
    pickDate,
    reset,
    setRange,
    totalCentsFor,
  };
}
