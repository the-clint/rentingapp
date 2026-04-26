"use client";

/**
 * Renter-mode availability calendar for the booking flow (Story 3-2).
 *
 * Differences from the operator calendar (`components/availability/calendar-grid.tsx`):
 *   - Selection-focused: taps set a start date and (second tap) an end date.
 *   - States come from `fetchPublicAvailability`, not from a pending toggle set.
 *   - Only `available` dates are tappable; past / booked / blocked / maintenance
 *     cells are inert.
 *   - No "Save changes" footer — the sticky booking bar (separate component)
 *     owns the CTA.
 *
 * The calendar is purely presentational: it takes an availability map and the
 * current selection as props and calls back on date picks and month navigation.
 * Fetching, realtime, and selection state live in the parent `BookingFlow`.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  buildMonthGrid,
  fromDateKey,
  toDateKey,
  type DateKey,
} from "@/lib/utils/date-range";

import type { AvailabilityDateState } from "@/lib/services/public-availability";

export interface RenterAvailabilityCalendarProps {
  year: number;
  monthZeroIndexed: number;
  /** Map of DateKey → state. Keys absent from the map render as `available`. */
  availability: Map<DateKey, AvailabilityDateState>;
  todayKey: DateKey;
  selectedStart: DateKey | null;
  selectedEnd: DateKey | null;
  onPickDate: (date: DateKey) => void;
  onNavigate: (delta: -1 | 1) => void;
  /** Minimum visible month — the "Prev" button is disabled at this floor. */
  minMonthKey: DateKey;
  /** Price-aware label for the selected range, used for screen-reader summary. */
  selectionSummary: string | null;
}

const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

const DAY_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

function stateLabel(state: AvailabilityDateState): string {
  switch (state) {
    case "past":
      return "past";
    case "booked":
      return "booked";
    case "blocked":
      return "unavailable";
    case "maintenance":
      return "maintenance buffer";
    case "available":
      return "available";
  }
}

function isInert(state: AvailabilityDateState): boolean {
  return state !== "available";
}

type CellRole =
  | "selected-start"
  | "selected-end"
  | "selected-single"
  | "in-range"
  | "plain";

function cellRoleFor(
  key: DateKey,
  selectedStart: DateKey | null,
  selectedEnd: DateKey | null,
): CellRole {
  if (!selectedStart) return "plain";
  if (selectedStart && !selectedEnd) {
    return key === selectedStart ? "selected-single" : "plain";
  }
  if (selectedStart && selectedEnd) {
    if (key === selectedStart && key === selectedEnd) return "selected-single";
    if (key === selectedStart) return "selected-start";
    if (key === selectedEnd) return "selected-end";
    if (key > selectedStart && key < selectedEnd) return "in-range";
  }
  return "plain";
}

function cellClassName(
  state: AvailabilityDateState,
  role: CellRole,
  isToday: boolean,
): string {
  const base =
    "relative flex h-11 w-11 items-center justify-center text-sm font-medium transition-colors sm:h-12 sm:w-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark";

  // In-range + selected roles override the underlying state visual.
  if (role === "selected-single") {
    return cn(base, "rounded-md bg-primary text-white");
  }
  if (role === "selected-start") {
    return cn(base, "rounded-l-md bg-primary text-white");
  }
  if (role === "selected-end") {
    return cn(base, "rounded-r-md bg-primary text-white");
  }
  if (role === "in-range") {
    return cn(base, "bg-primary/20 text-neutral-900");
  }

  let stateCls = "rounded-md ";
  switch (state) {
    case "past":
      stateCls += "bg-neutral-100 text-neutral-300 cursor-not-allowed";
      break;
    case "booked":
      stateCls +=
        "bg-neutral-100 text-neutral-500 cursor-not-allowed availability-hatch";
      break;
    case "blocked":
      stateCls +=
        "bg-neutral-100 text-neutral-500 cursor-not-allowed availability-hatch";
      break;
    case "maintenance":
      stateCls +=
        "bg-muted text-neutral-500 cursor-not-allowed availability-hatch";
      break;
    case "available":
      stateCls += "bg-card text-neutral-900 hover:bg-neutral-100";
      break;
  }
  const todayCls = isToday ? "ring-2 ring-primary-dark ring-inset" : "";
  return cn(base, stateCls, todayCls);
}

export function RenterAvailabilityCalendar({
  year,
  monthZeroIndexed,
  availability,
  todayKey: todayKeyStr,
  selectedStart,
  selectedEnd,
  onPickDate,
  onNavigate,
  minMonthKey,
  selectionSummary,
}: RenterAvailabilityCalendarProps) {
  const grid = useMemo(
    () => buildMonthGrid(year, monthZeroIndexed),
    [year, monthZeroIndexed],
  );
  const monthLabel = MONTH_FORMATTER.format(
    new Date(Date.UTC(year, monthZeroIndexed, 1)),
  );

  const [focusedKey, setFocusedKey] = useState<DateKey | null>(null);
  const cellRefs = useRef<Map<DateKey, HTMLButtonElement>>(new Map());

  const monthPrefix = `${String(year).padStart(4, "0")}-${String(
    monthZeroIndexed + 1,
  ).padStart(2, "0")}`;
  const firstOfMonth: DateKey = `${monthPrefix}-01`;
  const todayIsVisible = todayKeyStr.startsWith(monthPrefix);
  const focusIsVisible = focusedKey?.startsWith(monthPrefix) ?? false;
  const tabbableKey: DateKey = focusIsVisible
    ? (focusedKey as DateKey)
    : todayIsVisible
      ? todayKeyStr >= firstOfMonth
        ? todayKeyStr
        : firstOfMonth
      : firstOfMonth;

  useEffect(() => {
    if (focusedKey) {
      const el = cellRefs.current.get(focusedKey);
      if (el) el.focus();
    }
  }, [focusedKey]);

  const prevDisabled = monthPrefix <= minMonthKey.slice(0, 7);

  function handleKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    key: DateKey,
    state: AvailabilityDateState,
  ) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (isInert(state)) return;
      onPickDate(key);
      return;
    }
    if (e.key === "PageUp") {
      e.preventDefault();
      if (!prevDisabled) onNavigate(-1);
      return;
    }
    if (e.key === "PageDown") {
      e.preventDefault();
      onNavigate(1);
      return;
    }
    if (
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown"
    ) {
      e.preventDefault();
      const d = fromDateKey(key);
      const deltaDays =
        e.key === "ArrowLeft"
          ? -1
          : e.key === "ArrowRight"
            ? 1
            : e.key === "ArrowUp"
              ? -7
              : 7;
      const next = new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate() + deltaDays,
        ),
      );
      const nextKey = toDateKey(next);
      if (
        next.getUTCFullYear() !== year ||
        next.getUTCMonth() !== monthZeroIndexed
      ) {
        const delta: -1 | 1 =
          next.getUTCFullYear() < year ||
          (next.getUTCFullYear() === year &&
            next.getUTCMonth() < monthZeroIndexed)
            ? -1
            : 1;
        if (delta === -1 && prevDisabled) return;
        onNavigate(delta);
        setFocusedKey(nextKey);
        return;
      }
      setFocusedKey(nextKey);
    }
  }

  return (
    <div className="flex flex-col gap-space-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => onNavigate(-1)}
          disabled={prevDisabled}
          className="flex h-11 w-11 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark disabled:cursor-default disabled:text-neutral-300 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-h3 font-semibold text-neutral-900">
          {monthLabel}
        </div>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => onNavigate(1)}
          className="flex h-11 w-11 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      {selectionSummary && (
        <div className="sr-only" role="status" aria-live="polite">
          {selectionSummary}
        </div>
      )}
      <table
        role="grid"
        aria-label={`Availability calendar, ${monthLabel}`}
        className="w-full border-separate border-spacing-1"
      >
        <thead>
          <tr>
            {DAY_HEADERS.map((h, i) => (
              <th
                key={`${h}-${i}`}
                scope="col"
                className="pb-2 text-center text-xs font-medium uppercase tracking-wide text-neutral-500"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.weeks.map((week, wi) => (
            <tr key={`w-${wi}`}>
              {week.map((cell, ci) => {
                if (!cell.inMonth || cell.key == null) {
                  return (
                    <td
                      key={`e-${wi}-${ci}`}
                      role="gridcell"
                      aria-hidden="true"
                    />
                  );
                }
                const key = cell.key;
                let state: AvailabilityDateState =
                  availability.get(key) ?? "available";
                if (key < todayKeyStr) state = "past";
                const isToday = key === todayKeyStr;
                const inert = isInert(state);
                const role = cellRoleFor(key, selectedStart, selectedEnd);
                const day = Number(key.slice(8, 10));
                const isSelected =
                  role === "selected-start" ||
                  role === "selected-end" ||
                  role === "selected-single";
                const longDate = LONG_DATE_FORMATTER.format(fromDateKey(key));
                const label = `${longDate}, ${stateLabel(state)}`;
                return (
                  <td key={key} role="gridcell">
                    <button
                      ref={(el) => {
                        if (el) cellRefs.current.set(key, el);
                        else cellRefs.current.delete(key);
                      }}
                      type="button"
                      disabled={inert}
                      aria-label={label}
                      aria-pressed={!inert ? isSelected : undefined}
                      aria-current={isToday ? "date" : undefined}
                      tabIndex={tabbableKey === key ? 0 : -1}
                      onClick={() => {
                        if (inert) return;
                        onPickDate(key);
                      }}
                      onKeyDown={(e) => handleKeyDown(e, key, state)}
                      onFocus={() => setFocusedKey(key)}
                      className={cellClassName(state, role, isToday)}
                      data-state={state}
                      data-role={role}
                    >
                      <span>{day}</span>
                      {state === "maintenance" && (
                        <Wrench
                          aria-hidden="true"
                          className="absolute right-1 top-1 h-3 w-3"
                        />
                      )}
                      {state === "available" && role === "plain" && (
                        <span
                          aria-hidden="true"
                          className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-success"
                        />
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
