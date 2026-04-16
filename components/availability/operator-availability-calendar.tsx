"use client";

import { useEffect, useMemo, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { saveAvailability, type BlockedDateRow } from "@/lib/actions/availability-actions";
import {
  collapseConsecutiveDates,
  enumerateDateRange,
  todayKey,
  type DateKey,
} from "@/lib/utils/date-range";

import { CalendarGrid, type CellState } from "./calendar-grid";

interface State {
  year: number;
  monthZeroIndexed: number;
  /** Canonical server-known state (operator_block / booking / maintenance_buffer). */
  serverCells: Map<DateKey, CellState>;
  /** Pending operator toggles since last save (membership determines effective state). */
  pendingToggles: Set<DateKey>;
  saveError: string | null;
  isSaving: boolean;
}

type Action =
  | { type: "toggle"; key: DateKey }
  | { type: "toggle-many"; keys: DateKey[] }
  | { type: "discard" }
  | { type: "commit" }
  | { type: "navigate"; delta: -1 | 1 }
  | { type: "save-start" }
  | { type: "save-error"; message: string }
  | { type: "rehydrate"; serverCells: Map<DateKey, CellState> };

function hydrateServerCells(initialBlocks: BlockedDateRow[]): Map<DateKey, CellState> {
  const map = new Map<DateKey, CellState>();
  for (const row of initialBlocks) {
    const state: CellState =
      row.reason === "operator_block"
        ? "operator_block"
        : row.reason === "booking"
          ? "booking"
          : "maintenance_buffer";
    for (const key of enumerateDateRange(row.start_date, row.end_date)) {
      // Priority-order the server state: booking beats maintenance beats operator_block.
      const existing = map.get(key);
      if (existing === "booking") continue;
      if (existing === "maintenance_buffer" && state === "operator_block") continue;
      map.set(key, state);
    }
  }
  return map;
}

function isInertServerState(state: CellState | undefined): boolean {
  return state === "booking" || state === "maintenance_buffer";
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "toggle": {
      // Belt-and-braces: ignore toggles on inert server states.
      const server = state.serverCells.get(action.key);
      if (isInertServerState(server)) return state;
      const nextPending = new Set(state.pendingToggles);
      if (nextPending.has(action.key)) {
        nextPending.delete(action.key);
      } else {
        nextPending.add(action.key);
      }
      return { ...state, pendingToggles: nextPending };
    }
    case "toggle-many": {
      const nextPending = new Set(state.pendingToggles);
      for (const key of action.keys) {
        const server = state.serverCells.get(key);
        if (isInertServerState(server)) continue;
        if (nextPending.has(key)) nextPending.delete(key);
        else nextPending.add(key);
      }
      return { ...state, pendingToggles: nextPending };
    }
    case "discard":
      return { ...state, pendingToggles: new Set(), saveError: null };
    case "commit": {
      // Merge pendingToggles into serverCells optimistically, clear the set.
      const nextServer = new Map(state.serverCells);
      for (const key of state.pendingToggles) {
        const current = nextServer.get(key);
        if (current === "operator_block") {
          nextServer.delete(key);
        } else if (!isInertServerState(current)) {
          nextServer.set(key, "operator_block");
        }
      }
      return {
        ...state,
        serverCells: nextServer,
        pendingToggles: new Set(),
        saveError: null,
        isSaving: false,
      };
    }
    case "navigate":
      return {
        ...state,
        year:
          action.delta === -1 && state.monthZeroIndexed === 0
            ? state.year - 1
            : action.delta === 1 && state.monthZeroIndexed === 11
              ? state.year + 1
              : state.year,
        monthZeroIndexed:
          action.delta === -1 && state.monthZeroIndexed === 0
            ? 11
            : action.delta === 1 && state.monthZeroIndexed === 11
              ? 0
              : state.monthZeroIndexed + action.delta,
      };
    case "save-start":
      return { ...state, isSaving: true, saveError: null };
    case "save-error":
      return { ...state, isSaving: false, saveError: action.message };
    case "rehydrate":
      // Re-sync canonical server state after a `router.refresh()`. Pending
      // toggles are cleared — the caller is expected to only rehydrate on
      // an external update (e.g. a booking landed, or the operator saved
      // successfully and we want the refreshed view to win).
      return {
        ...state,
        serverCells: action.serverCells,
        pendingToggles: new Set(),
        saveError: null,
      };
  }
}

/**
 * Project effective cell states from (serverCells + pendingToggles).
 * pendingToggles against an `operator_block` server cell = pending unblock;
 * pendingToggles against an absent/available server cell = pending block.
 *
 * Accepts the primitives directly (not a wrapping State object) so the
 * component's useMemo can key off exactly the inputs the projection reads
 * without tripping the react-hooks/exhaustive-deps rule.
 */
function projectCellsFromMaps(
  serverCells: Map<DateKey, CellState>,
  pendingToggles: Set<DateKey>,
): Map<DateKey, CellState> {
  const out = new Map(serverCells);
  for (const key of pendingToggles) {
    const current = out.get(key);
    if (isInertServerState(current)) continue; // belt & braces
    if (current === "operator_block") {
      out.delete(key);
    } else {
      out.set(key, "operator_block");
    }
  }
  return out;
}

function projectCells(state: State): Map<DateKey, CellState> {
  return projectCellsFromMaps(state.serverCells, state.pendingToggles);
}

export interface OperatorAvailabilityCalendarProps {
  listingId: string;
  initialBlocks: BlockedDateRow[];
}

export function OperatorAvailabilityCalendar({
  listingId,
  initialBlocks,
}: OperatorAvailabilityCalendarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  const initialDate = useMemo(() => {
    const t = todayKey();
    return { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) - 1 };
  }, []);

  const [state, dispatch] = useReducer(reducer, undefined, (): State => ({
    year: initialDate.year,
    monthZeroIndexed: initialDate.month,
    serverCells: hydrateServerCells(initialBlocks),
    pendingToggles: new Set(),
    saveError: null,
    isSaving: false,
  }));

  // Re-sync canonical server state whenever the Server Component passes new
  // `initialBlocks` (e.g. after `router.refresh()` post-save, or because a
  // booking just landed). Without this, the reducer keeps its original
  // snapshot and any external updates are invisible until a hard reload.
  // We fingerprint on row count + id + reason so the effect only fires on
  // real content change, not on reference churn.
  const initialBlocksFingerprint = useMemo(
    () =>
      initialBlocks
        .map((b) => `${b.id}:${b.start_date}:${b.end_date}:${b.reason}`)
        .join("|"),
    [initialBlocks],
  );
  useEffect(() => {
    dispatch({
      type: "rehydrate",
      serverCells: hydrateServerCells(initialBlocks),
    });
    // initialBlocks is captured via the fingerprint; intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBlocksFingerprint]);

  // Project directly from the primitives the projection reads. The lint
  // warning about `state` being missing is expected and intentional — the
  // projection does NOT depend on year/monthZeroIndexed/saveError/isSaving,
  // and keying the memo on the entire reducer state (previous review
  // finding M4) would defeat memoization because every dispatch produces a
  // new state identity.
  const effectiveCells = useMemo(
    () => projectCellsFromMaps(state.serverCells, state.pendingToggles),
    [state.serverCells, state.pendingToggles],
  );
  const isDirty = state.pendingToggles.size > 0;
  const isBusy = isPending || state.isSaving;
  const today = todayKey();

  function handleToggle(key: DateKey) {
    // Ignore toggles while a save is in flight — otherwise a cell tapped
    // between dispatch(save-start) and dispatch(commit) would be silently
    // wiped by the commit reducer's pendingToggles reset.
    if (isBusy) return;
    dispatch({ type: "toggle", key });
  }

  function handleRangeToggle(startKey: DateKey, endKey: DateKey) {
    if (isBusy) return;
    const [lo, hi] = startKey <= endKey ? [startKey, endKey] : [endKey, startKey];
    const keys = enumerateDateRange(lo, hi).filter((k) => {
      if (k === startKey) return false;
      if (k < today) return false;
      const server = state.serverCells.get(k);
      return !isInertServerState(server);
    });
    dispatch({ type: "toggle-many", keys });
  }

  function handleNavigate(delta: -1 | 1) {
    dispatch({ type: "navigate", delta });
  }

  function handleDiscard() {
    dispatch({ type: "discard" });
  }

  function handleSave() {
    dispatch({ type: "save-start" });
    // Compute the new canonical set of blocked keys from projectCells.
    const projected = projectCells(state);
    const blockedKeys: DateKey[] = [];
    for (const [key, cell] of projected) {
      if (cell === "operator_block") blockedKeys.push(key);
    }
    blockedKeys.sort();
    const ranges = collapseConsecutiveDates(blockedKeys);

    startTransition(async () => {
      const result = await saveAvailability(listingId, ranges);
      if (result.success) {
        dispatch({ type: "commit" });
        setToast("Availability updated");
        router.refresh();
      } else {
        dispatch({ type: "save-error", message: result.error.message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-space-4">
      <CalendarGrid
        year={state.year}
        monthZeroIndexed={state.monthZeroIndexed}
        cells={effectiveCells}
        todayKey={today}
        onToggle={handleToggle}
        onRangeToggle={handleRangeToggle}
        onNavigate={handleNavigate}
      />

      {toast && !isDirty && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md bg-success/10 px-space-4 py-space-3 text-sm text-success"
        >
          {toast}
        </div>
      )}

      {isDirty && (
        <div className="sticky bottom-0 z-10 flex flex-col gap-space-2 border-t border-border bg-card p-space-4 shadow-lg">
          {state.saveError && (
            <div
              role="status"
              aria-live="polite"
              className="text-sm text-destructive"
            >
              {state.saveError}
            </div>
          )}
          <div className="flex items-center justify-between gap-space-3">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={isPending || state.isSaving}
              className="text-sm font-medium text-primary-dark underline-offset-4 hover:underline disabled:opacity-50"
            >
              Discard changes
            </button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending || state.isSaving}
            >
              {isPending || state.isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
