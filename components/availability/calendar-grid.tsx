"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight, Lock, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  buildMonthGrid,
  fromDateKey,
  toDateKey,
  type DateKey,
} from "@/lib/utils/date-range";

export type CellState =
  | "past"
  | "booking"
  | "maintenance_buffer"
  | "operator_block"
  | "available";

export interface CalendarGridProps {
  year: number;
  monthZeroIndexed: number;
  /** `cells` holds the non-`available` states; unknown/absent keys are `available`. */
  cells: Map<DateKey, CellState>;
  todayKey: DateKey;
  onToggle: (key: DateKey) => void;
  onRangeToggle: (startKey: DateKey, endKey: DateKey) => void;
  onNavigate: (delta: -1 | 1) => void;
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

function isInertState(state: CellState): boolean {
  return state === "past" || state === "booking" || state === "maintenance_buffer";
}

function stateLabel(state: CellState): string {
  switch (state) {
    case "past":
      return "past";
    case "booking":
      return "booked";
    case "maintenance_buffer":
      return "maintenance buffer";
    case "operator_block":
      return "blocked by you";
    case "available":
      return "available";
  }
}

function ariaLabelForState(state: CellState, key: DateKey): string {
  const longDate = LONG_DATE_FORMATTER.format(fromDateKey(key));
  return `${longDate}, ${stateLabel(state)}`;
}

export function cellClassName(state: CellState, isToday: boolean): string {
  const base =
    "relative flex h-11 w-11 items-center justify-center rounded-md text-sm font-medium transition-colors sm:h-12 sm:w-12";
  let stateCls = "";
  switch (state) {
    case "past":
      stateCls = "bg-neutral-100 text-neutral-300 cursor-default";
      break;
    case "booking":
      stateCls = "bg-neutral-100 text-neutral-300 cursor-default";
      break;
    case "maintenance_buffer":
      stateCls = "bg-muted text-neutral-500 cursor-default";
      break;
    case "operator_block":
      stateCls =
        "bg-neutral-100 text-neutral-500 hover:bg-muted availability-hatch";
      break;
    case "available":
      stateCls = "bg-card text-neutral-900 hover:bg-neutral-100";
      break;
  }
  const todayCls = isToday ? "ring-2 ring-primary-dark ring-inset" : "";
  return cn(base, stateCls, todayCls);
}

function cellStateFor(
  key: DateKey,
  cells: Map<DateKey, CellState>,
  todayKeyStr: DateKey,
): CellState {
  if (key < todayKeyStr) return "past";
  return cells.get(key) ?? "available";
}

export function CalendarGrid({
  year,
  monthZeroIndexed,
  cells,
  todayKey: todayKeyStr,
  onToggle,
  onRangeToggle,
  onNavigate,
}: CalendarGridProps) {
  const grid = buildMonthGrid(year, monthZeroIndexed);
  const monthLabel = MONTH_FORMATTER.format(
    new Date(Date.UTC(year, monthZeroIndexed, 1)),
  );

  // Anchor for shift-tap / shift-enter range selection.
  const [anchorKey, setAnchorKey] = useState<DateKey | null>(null);
  // The key that currently has DOM focus. Used for PageUp/PageDown + arrow
  // navigation within the visible month. Null until the user interacts —
  // we compute a `tabbableKey` default below so the grid is Tab-reachable
  // without stealing focus on mount.
  const [focusedKey, setFocusedKey] = useState<DateKey | null>(null);
  const cellRefs = useRef<Map<DateKey, HTMLButtonElement>>(new Map());

  // Derive the cell that should own tabIndex=0 when nothing is explicitly
  // focused yet. Priority: today (if visible) → the anchor (if set and
  // visible) → the 1st of the visible month. This satisfies AC #9 ("Tab
  // focuses the grid") and keeps Tab-reachability intact when the user
  // navigates to a different month (the old `focusedKey` would be outside
  // the visible grid, leaving every cell at tabIndex=-1).
  const monthPrefix = `${String(year).padStart(4, "0")}-${String(
    monthZeroIndexed + 1,
  ).padStart(2, "0")}`;
  const firstOfMonth: DateKey = `${monthPrefix}-01`;
  const todayIsVisible = todayKeyStr.startsWith(monthPrefix);
  const anchorIsVisible = anchorKey?.startsWith(monthPrefix) ?? false;
  const focusIsVisible = focusedKey?.startsWith(monthPrefix) ?? false;
  const tabbableKey: DateKey = focusIsVisible
    ? (focusedKey as DateKey)
    : todayIsVisible
      ? todayKeyStr
      : anchorIsVisible
        ? (anchorKey as DateKey)
        : firstOfMonth;

  useEffect(() => {
    // Only move DOM focus when the user explicitly sets focusedKey (via
    // arrow keys, Page nav, or a click). Do NOT auto-focus on mount just
    // because tabbableKey has a default — that would steal focus from
    // whatever the user was doing on the page.
    if (focusedKey) {
      const el = cellRefs.current.get(focusedKey);
      if (el) el.focus();
    }
  }, [focusedKey]);

  function handleCellClick(
    e: MouseEvent<HTMLButtonElement>,
    key: DateKey,
    state: CellState,
  ) {
    if (isInertState(state)) return;
    if (e.shiftKey && anchorKey) {
      onRangeToggle(anchorKey, key);
      setAnchorKey(null);
      return;
    }
    onToggle(key);
    setAnchorKey(key);
  }

  function handleCellKeyDown(
    e: KeyboardEvent<HTMLButtonElement>,
    key: DateKey,
    state: CellState,
  ) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (isInertState(state)) return;
      if (e.shiftKey && anchorKey) {
        onRangeToggle(anchorKey, key);
        setAnchorKey(null);
        return;
      }
      onToggle(key);
      setAnchorKey(key);
      return;
    }
    if (e.key === "PageUp") {
      e.preventDefault();
      onNavigate(-1);
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
      // If the next cell is in a different month, advance the month view.
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
        onNavigate(delta);
        // Focus restoration after month change is a lower priority; leave the
        // focused key as the new key, the parent will re-render with the new
        // month.
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
          className="flex h-11 w-11 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-dark"
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
                const state = cellStateFor(key, cells, todayKeyStr);
                const isToday = key === todayKeyStr;
                const inert = isInertState(state);
                const day = Number(key.slice(8, 10));
                const toggleable = !inert;
                return (
                  <td key={key} role="gridcell">
                    <button
                      ref={(el) => {
                        if (el) cellRefs.current.set(key, el);
                        else cellRefs.current.delete(key);
                      }}
                      type="button"
                      disabled={inert}
                      aria-label={ariaLabelForState(state, key)}
                      aria-pressed={
                        toggleable ? state === "operator_block" : undefined
                      }
                      aria-current={isToday ? "date" : undefined}
                      tabIndex={tabbableKey === key ? 0 : -1}
                      onClick={(e) => handleCellClick(e, key, state)}
                      onKeyDown={(e) => handleCellKeyDown(e, key, state)}
                      onFocus={() => setFocusedKey(key)}
                      className={cellClassName(state, isToday)}
                    >
                      <span>{day}</span>
                      {state === "booking" && (
                        <Lock
                          aria-hidden="true"
                          className="absolute right-1 top-1 h-3 w-3"
                        />
                      )}
                      {state === "maintenance_buffer" && (
                        <Wrench
                          aria-hidden="true"
                          className="absolute right-1 top-1 h-3 w-3"
                        />
                      )}
                      {state === "available" && (
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
