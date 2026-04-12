"use client";

/**
 * Client-side booking flow wrapper for Story 3-2.
 *
 * Owns:
 *   - Month navigation state (page forward and back, past months clamped).
 *   - Availability fetching (initial state seeded from the Server Component,
 *     subsequent months fetched on demand via the `public-availability` helper
 *     translated into a browser fetch through a lightweight client wrapper).
 *   - Supabase Realtime subscription to `booking_dates` and
 *     `listing_blocked_dates` for the listing. On any change, re-fetch the
 *     current month and clear the selection if it is no longer valid.
 *   - The selection state via `useBookingDateSelection` (URL-backed).
 *   - Rendering the calendar + sticky bar.
 *
 * Initial availability (current month) is passed in from the Server
 * Component so the first paint is fully hydrated. Later fetches happen on
 * the client via a browser Supabase client so they can run without round-
 * tripping through Server Actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  BookingStickyBar,
} from "@/components/booking/booking-sticky-bar";
import { RenterAvailabilityCalendar } from "@/components/booking/renter-availability-calendar";
import { useBookingDateSelection } from "@/components/booking/use-booking-date-selection";
import { createClient } from "@/lib/supabase/client";
import type {
  AvailabilityDate,
  AvailabilityDateState,
} from "@/lib/services/public-availability";
import {
  enumerateDateRange,
  fromDateKey,
  todayKey,
  toDateKey,
  type DateKey,
} from "@/lib/utils/date-range";

export interface BookingFlowProps {
  listingId: string;
  dailyRateCents: number;
  initialAvailability: AvailabilityDate[];
  initialYear: number;
  initialMonthZeroIndexed: number;
}

interface MonthWindow {
  year: number;
  monthZeroIndexed: number;
  startKey: DateKey;
  endKey: DateKey;
}

function windowFor(year: number, monthZeroIndexed: number): MonthWindow {
  const startKey = toDateKey(new Date(Date.UTC(year, monthZeroIndexed, 1)));
  const endKey = toDateKey(new Date(Date.UTC(year, monthZeroIndexed + 1, 0)));
  return { year, monthZeroIndexed, startKey, endKey };
}

function asMap(
  entries: AvailabilityDate[],
): Map<DateKey, AvailabilityDateState> {
  const map = new Map<DateKey, AvailabilityDateState>();
  for (const e of entries) map.set(e.date, e.state);
  return map;
}

function computeMinMonthKey(): DateKey {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return toDateKey(new Date(Date.UTC(year, month, 1)));
}

/**
 * Browser-side availability fetch. Mirrors the Server Component helper in
 * `lib/services/public-availability.ts` but uses the `@supabase/ssr` browser
 * client so it can run inside a React event handler.
 */
async function fetchAvailabilityBrowser(
  listingId: string,
  startDate: DateKey,
  endDate: DateKey,
): Promise<AvailabilityDate[]> {
  const supabase = createClient();
  const [blockedQuery, bookingQuery] = await Promise.all([
    supabase
      .from("listing_blocked_dates")
      .select("start_date, end_date, reason")
      .eq("listing_id", listingId)
      .lte("start_date", endDate)
      .gte("end_date", startDate),
    supabase
      .from("booking_dates")
      .select("date")
      .eq("listing_id", listingId)
      .gte("date", startDate)
      .lte("date", endDate),
  ]);

  const stateByDate = new Map<DateKey, AvailabilityDateState>();
  const today = todayKey();

  const blockedRows = (blockedQuery.data ?? []) as Array<{
    start_date: string;
    end_date: string;
    reason: "operator_block" | "booking" | "maintenance_buffer";
  }>;
  for (const row of blockedRows) {
    const stateForRow: AvailabilityDateState =
      row.reason === "maintenance_buffer"
        ? "maintenance"
        : row.reason === "booking"
          ? "booked"
          : "blocked";
    for (const key of enumerateDateRange(row.start_date, row.end_date)) {
      if (key < startDate || key > endDate) continue;
      const current = stateByDate.get(key);
      if (current === "booked") continue;
      if (current === "maintenance" && stateForRow === "blocked") continue;
      stateByDate.set(key, stateForRow);
    }
  }
  const bookingRows = (bookingQuery.data ?? []) as Array<{ date: string }>;
  for (const row of bookingRows) {
    stateByDate.set(row.date, "booked");
  }

  const out: AvailabilityDate[] = [];
  for (const key of enumerateDateRange(startDate, endDate)) {
    let state = stateByDate.get(key) ?? "available";
    if (key < today) state = "past";
    out.push({ date: key, state });
  }
  return out;
}

export function BookingFlow({
  listingId,
  dailyRateCents,
  initialAvailability,
  initialYear,
  initialMonthZeroIndexed,
}: BookingFlowProps) {
  const [currentWindow, setCurrentWindow] = useState<MonthWindow>(() =>
    windowFor(initialYear, initialMonthZeroIndexed),
  );
  const [availability, setAvailability] = useState<
    Map<DateKey, AvailabilityDateState>
  >(() => asMap(initialAvailability));
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const availabilityRef = useRef(availability);
  availabilityRef.current = availability;

  const selection = useBookingDateSelection();
  const router = useRouter();

  const minMonthKey = useMemo(() => computeMinMonthKey(), []);

  const refetchCurrentMonth = useCallback(async () => {
    const next = await fetchAvailabilityBrowser(
      listingId,
      currentWindow.startKey,
      currentWindow.endKey,
    );
    const map = asMap(next);
    setAvailability(map);
    return map;
  }, [listingId, currentWindow.startKey, currentWindow.endKey]);

  // Fetch fresh availability whenever the visible month changes — except the
  // initial render, which is already hydrated from the Server Component.
  const initialKeyRef = useRef<string>(
    `${initialYear}-${initialMonthZeroIndexed}`,
  );
  useEffect(() => {
    const key = `${currentWindow.year}-${currentWindow.monthZeroIndexed}`;
    if (key === initialKeyRef.current) return;
    let cancelled = false;
    fetchAvailabilityBrowser(
      listingId,
      currentWindow.startKey,
      currentWindow.endKey,
    ).then((next) => {
      if (!cancelled) setAvailability(asMap(next));
    });
    return () => {
      cancelled = true;
    };
  }, [
    listingId,
    currentWindow.year,
    currentWindow.monthZeroIndexed,
    currentWindow.startKey,
    currentWindow.endKey,
  ]);

  // Supabase Realtime: subscribe to booking_dates + listing_blocked_dates
  // changes for this listing. On any change, re-fetch the current month and
  // validate the current selection. If the selected range is no longer fully
  // available, clear it and surface a conflict banner.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`listing-availability-${listingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "booking_dates",
          filter: `listing_id=eq.${listingId}`,
        },
        async () => {
          const map = await refetchCurrentMonth();
          const selStart = selection.startDate;
          const selEnd = selection.endDate;
          if (selStart) {
            const range = selEnd
              ? enumerateDateRange(selStart, selEnd)
              : [selStart];
            const conflict = range.some((d) => {
              const st = map.get(d) ?? "available";
              return st !== "available";
            });
            if (conflict) {
              selection.reset();
              setConflictMessage(
                "Sorry, these dates were just booked. Please select different dates.",
              );
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "listing_blocked_dates",
          filter: `listing_id=eq.${listingId}`,
        },
        async () => {
          await refetchCurrentMonth();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // selection.* captured via selection ref in the callback — we intentionally
    // don't resubscribe on every selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId, refetchCurrentMonth]);

  const handleNavigate = useCallback(
    (delta: -1 | 1) => {
      setCurrentWindow((prev) => {
        const next = new Date(
          Date.UTC(prev.year, prev.monthZeroIndexed + delta, 1),
        );
        const ny = next.getUTCFullYear();
        const nm = next.getUTCMonth();
        const candidate = windowFor(ny, nm);
        if (candidate.startKey < minMonthKey) return prev;
        return candidate;
      });
    },
    [minMonthKey],
  );

  const handlePickDate = useCallback(
    (key: DateKey) => {
      setConflictMessage(null);
      // Validate: if there's an existing start and the user is picking an
      // end AFTER it, the entire range must be clean. If not, reject to
      // just-a-new-start.
      const currentStart = selection.startDate;
      const currentEnd = selection.endDate;
      if (currentStart && !currentEnd && key > currentStart) {
        const range = enumerateDateRange(currentStart, key);
        const hasBlocker = range.some((d) => {
          const st = availability.get(d) ?? "available";
          if (d < todayKey()) return true;
          return st !== "available";
        });
        if (hasBlocker) {
          setConflictMessage(
            "That range includes unavailable dates — please pick a different end date.",
          );
          return;
        }
      }
      selection.pickDate(key);
    },
    [selection, availability],
  );

  const selStart = selection.startDate;
  const selEnd = selection.endDate;
  const selDays = selection.totalDays;
  const selTotalCents = selection.totalCentsFor(dailyRateCents);
  const selectionSummary = useMemo(() => {
    if (!selStart) return null;
    if (!selEnd) {
      return `Selected ${formatLong(selStart)}`;
    }
    return `Selected ${formatLong(selStart)} to ${formatLong(selEnd)}, ${selDays} ${
      selDays === 1 ? "day" : "days"
    }, $${(selTotalCents / 100).toFixed(2)}`;
  }, [selStart, selEnd, selDays, selTotalCents]);

  const todayKeyStr = useMemo(() => todayKey(), []);
  const totalCents = selection.totalCentsFor(dailyRateCents);

  return (
    <div className="flex flex-col gap-space-4">
      <h2 className="text-h3 font-semibold text-neutral-900">
        Select your dates
      </h2>
      {conflictMessage && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-space-3 py-space-2 text-small text-destructive"
        >
          {conflictMessage}
        </div>
      )}
      <RenterAvailabilityCalendar
        year={currentWindow.year}
        monthZeroIndexed={currentWindow.monthZeroIndexed}
        availability={availability}
        todayKey={todayKeyStr}
        selectedStart={selection.startDate}
        selectedEnd={selection.endDate}
        onPickDate={handlePickDate}
        onNavigate={handleNavigate}
        minMonthKey={minMonthKey}
        selectionSummary={selectionSummary}
      />
      <div className="h-32" aria-hidden="true" />
      <BookingStickyBar
        startDate={selection.startDate}
        endDate={selection.endDate}
        totalDays={selection.totalDays}
        totalCents={totalCents}
        isVisible={selection.startDate != null}
        onBookNow={() => {
          // Story 3-3 hookup: navigate to the phone-OTP verify step,
          // carrying the selected start/end dates through the URL so
          // the downstream flow (contract, payment) can pick them up.
          if (!selection.startDate || !selection.endDate) return;
          const params = new URLSearchParams();
          params.set("start", selection.startDate);
          params.set("end", selection.endDate);
          router.push(`/book/${listingId}/verify?${params.toString()}`);
        }}
      />
    </div>
  );
}

const LONG_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatLong(key: DateKey): string {
  return LONG_FORMATTER.format(fromDateKey(key));
}
