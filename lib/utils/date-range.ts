/**
 * Pure, framework-free date helpers for the availability calendar.
 *
 * Conventions:
 * - Canonical date representation is a `YYYY-MM-DD` string (`DateKey`).
 *   Lexicographic sort == chronological sort, and the form is timezone-free.
 * - All `Date` construction is UTC-only. Never `new Date(y, m, d)` (local
 *   time); always `new Date(Date.UTC(y, m, d))` or `new Date(key + "T00:00:00Z")`.
 * - No runtime "brand" on `DateKey` — it is a type alias for `string`. The
 *   regex `^\d{4}-\d{2}-\d{2}$` is enforced by the Zod schema at the edges.
 * - No external date library (no date-fns, dayjs, luxon, @internationalized/date).
 */

/**
 * A canonical date key in `YYYY-MM-DD` form. Always UTC-normalized.
 * Alias for `string` — the narrowing is enforced by Zod, not TypeScript.
 */
export type DateKey = string;

/**
 * Convert a `Date` to a canonical `YYYY-MM-DD` key.
 *
 * IMPORTANT: the caller must pass a UTC-constructed Date — i.e. created via
 * `new Date(Date.UTC(y, m, d))` — otherwise `toISOString().slice(0, 10)` can
 * return the previous or next day depending on the runtime timezone.
 */
export function toDateKey(date: Date): DateKey {
  return date.toISOString().slice(0, 10);
}

/**
 * Parse a `YYYY-MM-DD` key back to a UTC `Date` anchored at 00:00:00Z.
 */
export function fromDateKey(key: DateKey): Date {
  return new Date(key + "T00:00:00Z");
}

/**
 * Today's key, from the runtime wall clock. Used by the operator UI to gate
 * "past" date cells and by the Zod refine that rejects past ranges.
 *
 * Tests should pin this with `vi.setSystemTime(new Date("2026-04-09T12:00:00Z"))`
 * for determinism.
 */
export function todayKey(): DateKey {
  const now = new Date();
  return toDateKey(
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ),
  );
}

/**
 * Inclusive enumeration of every date key between `start` and `end`.
 *
 * Iterates via `Date.UTC` math so there is zero DST/local-time drift. For a
 * single-day range (`start === end`) returns `[start]`. Returns `[]` when
 * `start > end` (caller should validate ordering at the edge).
 */
export function enumerateDateRange(start: DateKey, end: DateKey): DateKey[] {
  if (start > end) return [];
  const keys: DateKey[] = [];
  const startDate = fromDateKey(start);
  const endDate = fromDateKey(end);
  let y = startDate.getUTCFullYear();
  let m = startDate.getUTCMonth();
  let d = startDate.getUTCDate();
  const endY = endDate.getUTCFullYear();
  const endM = endDate.getUTCMonth();
  const endD = endDate.getUTCDate();
  // Loop by UTC-constructing each successive day.
  while (true) {
    const cursor = new Date(Date.UTC(y, m, d));
    keys.push(toDateKey(cursor));
    if (y === endY && m === endM && d === endD) break;
    // Advance one UTC day.
    const next = new Date(Date.UTC(y, m, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth();
    d = next.getUTCDate();
  }
  return keys;
}

/**
 * Does the inclusive closed range `a` overlap the inclusive closed range `b`?
 * Standard interval overlap, evaluated on lexicographic `YYYY-MM-DD` strings
 * (works because the canonical form sorts chronologically).
 */
export function rangesOverlap(
  a: { startDate: DateKey; endDate: DateKey },
  b: { startDate: DateKey; endDate: DateKey },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export interface MonthGridCell {
  key: DateKey | null;
  inMonth: boolean;
}

export interface MonthGrid {
  weeks: MonthGridCell[][];
}

/**
 * Build a 6-row × 7-column grid for the given month. First column is Sunday.
 * Cells before the 1st of the month and after the last day render as
 * `{ key: null, inMonth: false }` placeholders.
 */
export function buildMonthGrid(year: number, monthZeroIndexed: number): MonthGrid {
  const firstOfMonth = new Date(Date.UTC(year, monthZeroIndexed, 1));
  const firstDow = firstOfMonth.getUTCDay(); // 0 = Sun
  // Day count: day 0 of next month == last day of this month.
  const lastOfMonth = new Date(Date.UTC(year, monthZeroIndexed + 1, 0));
  const daysInMonth = lastOfMonth.getUTCDate();

  const cells: MonthGridCell[] = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push({ key: null, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      key: toDateKey(new Date(Date.UTC(year, monthZeroIndexed, day))),
      inMonth: true,
    });
  }
  // Pad to 42 cells (6 rows * 7 cols).
  while (cells.length < 42) {
    cells.push({ key: null, inMonth: false });
  }

  const weeks: MonthGridCell[][] = [];
  for (let w = 0; w < 6; w++) {
    weeks.push(cells.slice(w * 7, w * 7 + 7));
  }
  return { weeks };
}

export interface CollapsedRange {
  startDate: DateKey;
  endDate: DateKey;
}

/**
 * Collapse a sorted array of date keys into minimal inclusive run-length
 * ranges. `[2026-04-11, 2026-04-12, 2026-04-13, 2026-04-20]` becomes
 * `[{start: 11, end: 13}, {start: 20, end: 20}]`.
 *
 * Caller must pass a sorted-ascending, de-duplicated array. Returns `[]` for
 * empty input.
 */
export function collapseConsecutiveDates(keys: DateKey[]): CollapsedRange[] {
  if (keys.length === 0) return [];
  const ranges: CollapsedRange[] = [];
  let runStart = keys[0];
  let runEnd = keys[0];
  for (let i = 1; i < keys.length; i++) {
    const prev = fromDateKey(runEnd);
    const nextExpected = toDateKey(
      new Date(
        Date.UTC(
          prev.getUTCFullYear(),
          prev.getUTCMonth(),
          prev.getUTCDate() + 1,
        ),
      ),
    );
    if (keys[i] === nextExpected) {
      runEnd = keys[i];
    } else {
      ranges.push({ startDate: runStart, endDate: runEnd });
      runStart = keys[i];
      runEnd = keys[i];
    }
  }
  ranges.push({ startDate: runStart, endDate: runEnd });
  return ranges;
}
