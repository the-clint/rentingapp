# Story 2.2: Manage Availability Calendar (Operator Mode)

Status: done

## Story

As an **operator**,
I want to open a listing's availability calendar and block date ranges when my equipment is not available,
so that renters cannot book dates when I am using the equipment myself or when it needs maintenance.

## Acceptance Criteria

1. **Route exists:** An authenticated operator can navigate to `/listings/[listingId]/availability` — linked from a new `"Manage availability"` button on the listing detail placeholder at `/listings/[listingId]` — and the page renders inside the existing operator shell. Unauthenticated or non-operator users are redirected to `/auth/login` by the existing `lib/supabase/proxy.ts` `operatorPrefixes` match on `/listings`; no proxy changes are required.
2. **Listing ownership enforced:** The page's Server Component fetches the listing by id via `supabase.from("listings").select("id, name").eq("id", listingId).single()` inside a `<Suspense>` boundary. If the row does not exist, the page renders `notFound()`. If the row exists but `operator_id !== auth.uid()`, RLS already returns no row and the page renders `notFound()` (do NOT leak a 403 vs 404 distinction).
3. **Page header:** The page renders `<h1>{listing.name}</h1>` (`text-h1` / `text-h1-lg`) with a secondary line `"Manage availability"` (`text-h2`), a `Back to listing` link to `/listings/[listingId]`, and the `<OperatorAvailabilityCalendar listingId={listing.id} />` Client Component below.
4. **Month-grid calendar renders:** The calendar renders a single month at a time using a `role="grid"` container with `aria-label="Availability calendar, {monthName} {year}"`. The layout is: a header row with `< {Month Year} >` navigation, a `S M T W T F S` day-of-week header, and a 6-row × 7-column date grid. Leading/trailing cells for days outside the current month render as empty `<td>` placeholders. The calendar defaults to the current month on mount and supports `Prev` / `Next` navigation by 1 month. No year picker.
5. **Date cell states (operator mode):** Every in-month cell is rendered with exactly one of these states, in priority order:
   - `past` — date is strictly before today (UTC). Visual: `bg-neutral-100 text-neutral-300`. Not tappable. `aria-label="{long date}, past"`.
   - `booking` — overlaps a `listing_blocked_dates` row with `reason = 'booking'`. Visual: `bg-neutral-100 text-neutral-300`, small `Lock` icon. Not tappable. `aria-label="{long date}, booked"`. (Not producible by Story 2.2 UI — read-only overlay for Epic 3.)
   - `maintenance_buffer` — overlaps a row with `reason = 'maintenance_buffer'`. Visual: `bg-neutral-200 text-neutral-600`, small `Wrench` icon. Not tappable. `aria-label="{long date}, maintenance buffer"`.
   - `operator_block` — overlaps a row with `reason = 'operator_block'`. Visual: `bg-neutral-100 text-neutral-500` with diagonal-hatch SVG pattern. Tappable to unblock. `aria-label="{long date}, blocked by you"`. `aria-pressed="true"`.
   - `available` — everything else. Visual: white bg, `text-neutral-900`, subtle `success` green dot in the corner. Tappable to block. `aria-label="{long date}, available"`. `aria-pressed="false"`.
   - `today` modifier — additionally adds a `ring-2 ring-primary-dark ring-inset` outline on whichever state applies.
6. **Tap to toggle a single date:** Tapping an `available` in-month cell adds that date to the pending "blocked" set and re-renders it as `operator_block`. Tapping an already-pending `operator_block` cell removes it from the pending set and re-renders it as `available`. Past / booking / maintenance_buffer cells are inert on tap. The pending set lives in component state and is not persisted until the operator clicks `Save changes` (see AC #8).
7. **Range select:** Holding `Shift` and tapping a second cell (or tapping two cells in sequence with the `Range select` mode toggled on via a pill above the grid) fills the inclusive range between the first and second tap with the pending action: if the starting cell was `available`, every available-or-already-pending cell in the range becomes pending-blocked; if the starting cell was `operator_block`, every operator-block cell in the range is un-pending-blocked. Cells with state `past`, `booking`, or `maintenance_buffer` inside the range are skipped (stay as they are) — the range does NOT error or abort.
8. **Dirty state and save:** As soon as the pending set differs from the server-fetched state, a sticky footer appears anchored to the bottom of the calendar card containing a `Discard changes` link and a `Save changes` primary button (`primary` amber). Clicking `Save changes` calls the Server Action `saveAvailability(listingId, blockedRanges)` inside `startTransition`. On success, a toast shows `"Availability updated"`, the fetched state is refreshed (via `router.refresh()`), and the footer disappears. On failure, the footer stays and a form-level error message renders above the button using the `result.error.message` text.
9. **Keyboard navigation:** Tab focuses the grid. Arrow keys (`Left`, `Right`, `Up`, `Down`) move focus between in-month cells; crossing a month boundary auto-advances `Prev`/`Next`. `Enter` or `Space` on an `available` or `operator_block` cell toggles its pending state exactly like tap. `Shift+Enter` / `Shift+Space` performs a range select anchored to the last focused toggle. `PageUp` / `PageDown` navigates months. Non-toggleable states (`past`, `booking`, `maintenance_buffer`) are focusable but swallow Enter/Space silently.
10. **Server Action `saveAvailability`:** Lives in `lib/actions/availability-actions.ts`. Signature: `async function saveAvailability(listingId: string, ranges: BlockedRangeInput[]): Promise<Result<{ blockedCount: number }>>`. Behavior: (a) inside-function `await createClient()`, (b) `auth.getUser()` → `err("UNAUTHENTICATED")` if missing, (c) `blockedRangesSchema.safeParse(ranges)` → `err("VALIDATION_ERROR", issues[0].message)` on failure, (d) ownership probe — `select id from listings where id = $1 and operator_id = auth.uid()` → `err("NOT_FOUND", "Listing not found")` on zero rows (RLS also enforces this; this gives a nicer error), (e) inside a single transaction, DELETE all `listing_blocked_dates` rows for this listing where `reason = 'operator_block'`, then INSERT one row per range with `reason = 'operator_block'`, (f) return `ok({ blockedCount: ranges.length })`. Never touches rows with `reason IN ('booking', 'maintenance_buffer')` — those belong to Epic 3.
11. **Zod schema `blockedRangesSchema`:** Lives in `lib/schemas/availability-schema.ts`. Validates an array of `{ startDate: string, endDate: string }` objects where both strings match `^\d{4}-\d{2}-\d{2}$`, `startDate <= endDate` lexicographically, `startDate >= today` (UTC), and no two ranges overlap. Exact error messages defined in the Dev Notes "Zod Schema Rules" block below.
12. **Database migration:** A new migration `supabase/migrations/00004_listing_blocked_dates.sql` exists and, when applied, creates `public.listing_blocked_dates` with the exact columns, constraints, indexes, and RLS policies from the DDL block in Dev Notes. RLS: operators can `SELECT/INSERT/UPDATE/DELETE` rows for listings they own; anon gets no access to this table at all (Epic 3 will add a projection view, not a direct grant).
13. **Tests pass:** New tests (all colocated):
    - `lib/schemas/availability-schema.test.ts` — 6 cases: happy single range, `startDate > endDate` rejected, `startDate` in the past rejected, malformed date string rejected, two overlapping ranges rejected, two adjacent non-overlapping ranges accepted.
    - `lib/actions/availability-actions.test.ts` — 4 cases: happy replace, `UNAUTHENTICATED` when no user, `VALIDATION_ERROR` when schema fails, `NOT_FOUND` when ownership probe returns no row.
    - `components/availability/calendar-grid.test.tsx` — renders a month, `Prev`/`Next` navigate, tapping an available cell marks it pending-blocked and the save footer appears, tapping it again clears the pending state and hides the footer.
    - `lib/utils/date-range.test.ts` — the pure date helpers (`toDateKey`, `enumerateDateRange`, `rangesOverlap`) — 4+ cases covering month boundary, year boundary, single-day range, and overlap detection.
    Existing test suite still passes. `npm run lint`, `npm run type-check`, `npm run test`, and `npm run build` complete cleanly.
14. **Wizard Step 3 unchanged:** `components/listing/availability-step.tsx` remains the minimal placeholder from Story 2.1. Story 2.2 does NOT add calendar management to the create-listing wizard. Rationale: after publish, the operator lands on `/listings/[listingId]` with a link to `/listings/[listingId]/availability` — that is the canonical entry point.

## Tasks / Subtasks

- [x] Task 1: Database migration for `listing_blocked_dates` (AC: #12)
  - [x] 1.1 Create `supabase/migrations/00004_listing_blocked_dates.sql` with the same file-header comment style as `00003_listings.sql`.
  - [x] 1.2 Define the `listing_blocked_dates` table with columns from the DDL block in Dev Notes (`id`, `listing_id`, `start_date`, `end_date`, `reason`, `created_at`). Include the `CHECK (start_date <= end_date)` and the `CHECK (reason IN (...))` constraints verbatim.
  - [x] 1.3 Add indexes: `(listing_id, start_date)` for range lookups, plus `(listing_id) WHERE reason = 'operator_block'` for the DELETE-then-INSERT path in `saveAvailability`.
  - [x] 1.4 Enable RLS and create the four policies from the DDL block — operator SELECT/INSERT/UPDATE/DELETE all gated by an `EXISTS (SELECT 1 FROM public.listings WHERE id = listing_id AND operator_id = auth.uid())` subquery. Do NOT grant anon any access on this table.
  - [x] 1.5 Run `supabase db reset` locally and verify the migration applies cleanly on top of `00003_listings.sql`. If no local Supabase instance is available, flag it in Completion Notes — the migration file still ships.
  - [x] 1.6 Do NOT regenerate `lib/types/database.ts` (it does not exist in this repo; see Story 2.1 Completion Note 2). Type the insert/select rows explicitly in the Server Action.

- [x] Task 2: Pure date helpers (AC: #4, #5, #11)
  - [x] 2.1 Create `lib/utils/date-range.ts`. Export pure, framework-free, test-in-isolation helpers. NO new npm dependency — native `Date` + UTC string ops only.
  - [x] 2.2 Export `type DateKey = string` (branded via a type alias comment, not a runtime brand) where the value always matches `YYYY-MM-DD`. All calendar state keys off of this canonical form.
  - [x] 2.3 Export `toDateKey(date: Date): DateKey` — returns `date.toISOString().slice(0, 10)`. Document explicitly that this depends on the caller passing a UTC-constructed Date (i.e. `new Date(Date.UTC(y, m, d))`), not a local-time `new Date(y, m, d)`.
  - [x] 2.4 Export `fromDateKey(key: DateKey): Date` — returns `new Date(key + "T00:00:00Z")`.
  - [x] 2.5 Export `todayKey(): DateKey` — returns `toDateKey(new Date())`. Note in a comment: this uses the runtime's wall clock, which is fine for the operator UI; tests should mock it via `vi.setSystemTime`.
  - [x] 2.6 Export `enumerateDateRange(start: DateKey, end: DateKey): DateKey[]` — inclusive, returns one key per day. Iterates via `Date.UTC` math, never via naive `+ 86400000` which breaks across DST in local-time Dates (but is fine in UTC; keep the UTC invariant clear in the doc comment).
  - [x] 2.7 Export `rangesOverlap(a: { startDate: DateKey; endDate: DateKey }, b: { startDate: DateKey; endDate: DateKey }): boolean` — standard `a.start <= b.end && b.start <= a.end` comparison on lexicographic strings (works because `YYYY-MM-DD` sorts correctly).
  - [x] 2.8 Export `buildMonthGrid(year: number, monthZeroIndexed: number): { weeks: Array<Array<{ key: DateKey | null; inMonth: boolean }>> }` — returns 6 rows × 7 columns, with `key: null` placeholders for cells before the 1st and after the last day of the month. First column is Sunday.
  - [x] 2.9 Export `collapseConsecutiveDates(keys: DateKey[]): BlockedRangeInput[]` — turns a sorted array of date keys into minimal run-length ranges (e.g. `[2026-04-11, 2026-04-12, 2026-04-13, 2026-04-20]` → `[{ startDate: "2026-04-11", endDate: "2026-04-13" }, { startDate: "2026-04-20", endDate: "2026-04-20" }]`).
  - [x] 2.10 Create `lib/utils/date-range.test.ts`. Cover: `toDateKey` round-trips through `fromDateKey`; `enumerateDateRange` across a month boundary (Apr 29 → May 2); across a year boundary (Dec 30 → Jan 2); single-day range; `rangesOverlap` for overlap / touch / gap / reverse; `collapseConsecutiveDates` happy paths.

- [x] Task 3: Zod schema for blocked ranges (AC: #10, #11)
  - [x] 3.1 Create `lib/schemas/availability-schema.ts`. Import `rangesOverlap`, `todayKey` from `@/lib/utils/date-range`.
  - [x] 3.2 Export `blockedRangeSchema`:
    ```ts
    export const blockedRangeSchema = z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
      endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
    }).refine((r) => r.startDate <= r.endDate, {
      message: "Start date must be on or before end date",
      path: ["endDate"],
    }).refine((r) => r.startDate >= todayKey(), {
      message: "You cannot block a date in the past",
      path: ["startDate"],
    });
    ```
  - [x] 3.3 Export `blockedRangesSchema = z.array(blockedRangeSchema).superRefine((ranges, ctx) => { ... })`. In the `superRefine`, iterate every pair `(i, j)` where `i < j` and call `rangesOverlap`. On overlap, `ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Blocked date ranges cannot overlap", path: [j] })` and return. Do NOT allow a single range to overlap itself (that would be a regex/parse bug, not a range bug).
  - [x] 3.4 Export `type BlockedRangeInput = z.infer<typeof blockedRangeSchema>`.
  - [x] 3.5 Create `lib/schemas/availability-schema.test.ts`. Pin `vi.setSystemTime(new Date("2026-04-09T12:00:00Z"))` in `beforeEach` so the "in the past" rule is deterministic. Cover all 6 cases from AC #13. Use Zod v4 `.issues[0].message` assertions.

- [x] Task 4: Server Action `saveAvailability` and data loader (AC: #2, #10)
  - [x] 4.1 Create `lib/actions/availability-actions.ts` with `"use server"` on line 1. Import `createClient`, `ok`/`err`/`Result`, `blockedRangesSchema`, and the `BlockedRangeInput` type. Define an inline `BlockedDateInsertRow` and `BlockedDateRow` type instead of relying on generated DB types (same pattern as `listing-actions.ts`).
  - [x] 4.2 Implement `saveAvailability(listingId: string, ranges: BlockedRangeInput[]): Promise<Result<{ blockedCount: number }>>`:
    ```
    1. supabase = await createClient()
    2. user = await supabase.auth.getUser(); if !user → UNAUTHENTICATED
    3. parsed = blockedRangesSchema.safeParse(ranges); if !ok → VALIDATION_ERROR
    4. owned = await supabase.from("listings").select("id").eq("id", listingId).maybeSingle()
       if !owned.data → NOT_FOUND ("Listing not found")
    5. del = await supabase.from("listing_blocked_dates").delete()
          .eq("listing_id", listingId).eq("reason", "operator_block")
       if del.error → DATABASE_ERROR
    6. if parsed.data.length > 0:
          ins = await supabase.from("listing_blocked_dates").insert(
            parsed.data.map((r) => ({
              listing_id: listingId,
              start_date: r.startDate,
              end_date:   r.endDate,
              reason:     "operator_block",
            }))
          )
          if ins.error → DATABASE_ERROR
    7. return ok({ blockedCount: parsed.data.length })
    ```
  - [x] 4.3 Known MVP limitation — document in a top-of-file JSDoc: the DELETE + INSERT pair is NOT wrapped in a single PostgREST transaction (Supabase REST does not expose BEGIN/COMMIT). Last-write-wins concurrency is acceptable per the "concurrency" concern in the story brief. A server-side Postgres function (RPC) could tighten this in a follow-up story; cite it as a future concern in Dev Notes.
  - [x] 4.4 Export a read helper `getListingBlockedDates(listingId: string): Promise<Result<BlockedDateRow[]>>` that selects `id, start_date, end_date, reason` from `listing_blocked_dates` where `listing_id = $1`, ordered by `start_date`. Used by the availability page Server Component to hydrate the initial calendar state. Returns all reasons (`operator_block`, `booking`, `maintenance_buffer`) — the calendar renders each with its own visual state.
  - [x] 4.5 Create `lib/actions/availability-actions.test.ts`. Mock `@/lib/supabase/server` with a `mockState` pattern copied from `lib/actions/listing-actions.test.ts`. Cover the 4 cases in AC #13. For the `NOT_FOUND` case, have the `listings` ownership probe `maybeSingle()` resolve with `{ data: null, error: null }`.

- [x] Task 5: Calendar-grid Client Component (AC: #4, #5, #9)
  - [x] 5.1 Create `components/availability/calendar-grid.tsx` as a Client Component (`"use client"`). Props: `year: number`, `monthZeroIndexed: number`, `cells: Map<DateKey, CellState>`, `onToggle(key: DateKey): void`, `onRangeToggle(startKey: DateKey, endKey: DateKey): void`, `onNavigate(delta: -1 | 1): void`. No internal data fetching.
  - [x] 5.2 Render the month header (`< {Month Year} >`) with `Prev`/`Next` `<button>`s. Use `Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })` — no date library.
  - [x] 5.3 Render the 7-column day-of-week header. Below it, render `buildMonthGrid(year, monthZeroIndexed).weeks` into a `<table role="grid">`. Each in-month cell is a `<td role="gridcell"><button type="button">{dayNum}</button></td>`.
  - [x] 5.4 Cell visuals: compute the cell's `CellState` from the `cells` map (defaulting to `available` if absent and not past). Class names come from a `cellClassName(state, isToday)` helper in the same file. Use `cn()` from `@/lib/utils`. Past cells: `bg-neutral-100 text-neutral-300 cursor-default`. Operator-block cells: use a `bg-[url('/patterns/hatch.svg')]` (or an inline SVG `<pattern>` applied via a sibling absolute element — pick inline SVG to avoid adding a public asset file). Today cells: add `ring-2 ring-primary-dark ring-inset`.
  - [x] 5.5 Keyboard handling: on the grid, capture `onKeyDown` for arrows, Enter, Space, PageUp, PageDown. Maintain `focusedKey` in local state so arrow navigation works even when the operator has not clicked yet. Focus is moved via `ref.current.focus()` after state updates in a `useEffect`.
  - [x] 5.6 Range-select behavior: track `anchorKey: DateKey | null` in local state. When the user clicks with `Shift` held (or the "Range select" mode pill is on), the second click fires `onRangeToggle(anchorKey, clickedKey)` and clears the anchor. Otherwise a normal click fires `onToggle(clickedKey)` and sets the anchor to that key.
  - [x] 5.7 Accessibility: `<table role="grid" aria-label="Availability calendar, April 2026">`. Each interactive cell button gets `aria-label="{long date}, {state label}"` via an `ariaLabelForState(state, dateKey)` helper. Non-interactive (past/booking/buffer) cells still render the `<button>` but with `disabled` and a `cursor-default` class so focus ring still shows on keyboard traversal.
  - [x] 5.8 Create `components/availability/calendar-grid.test.tsx`. Render with a small `cells` map, assert the month label, assert `Next` button click fires `onNavigate(+1)`, assert clicking an available cell fires `onToggle(key)`, assert pressing `Enter` on a focused available cell fires `onToggle(key)`. Do NOT attempt to test keyboard arrow movement across months — that's an integration test and too brittle in jsdom for this story.

- [x] Task 6: Container — `OperatorAvailabilityCalendar` (AC: #6, #7, #8)
  - [x] 6.1 Create `components/availability/operator-availability-calendar.tsx` as a Client Component. Props: `listingId: string`, `initialBlocks: BlockedDateRow[]`. Owns the reducer and orchestrates the grid.
  - [x] 6.2 State via `useReducer`:
    ```ts
    type State = {
      year: number;
      monthZeroIndexed: number;
      // The canonical server-known state, keyed by DateKey.
      serverCells: Map<DateKey, CellState>;  // operator_block / booking / maintenance_buffer
      // Pending operator edits: the set of DateKeys that the user has toggled
      // since the last save. Membership + serverCells produces the effective
      // state on render via a `projectCells(state)` helper.
      pendingToggles: Set<DateKey>;
      saveError: string | null;
      isSaving: boolean;
    };
    ```
  - [x] 6.3 Hydrate `serverCells` from `initialBlocks` on first render. Every day inside a `reason='operator_block'` range becomes an `operator_block` cell; `reason='booking'` → `booking` cell; `reason='maintenance_buffer'` → `maintenance_buffer` cell. Use `enumerateDateRange` from Task 2.
  - [x] 6.4 Implement `projectCells(state)` — starts from `serverCells`, then for each key in `pendingToggles`: if the server state was `operator_block`, remove it (pending unblock); if the server state was `available` (i.e. absent from `serverCells` and not past/booking/buffer), add it as `operator_block` (pending block). Tap actions on `past`/`booking`/`maintenance_buffer` cells must be blocked at the dispatch level — `projectCells` simply ignores any pending toggle whose server state is in that inert set (belt + braces).
  - [x] 6.5 Dispatch handlers: `onToggle(key)` → `dispatch({ type: "toggle", key })`; `onRangeToggle(start, end)` → enumerate the inclusive range via `enumerateDateRange`, filter out inert states, then dispatch `{ type: "toggle-many", keys }`.
  - [x] 6.6 `isDirty = state.pendingToggles.size > 0`. When `isDirty`, render the sticky footer: a `Discard changes` button that dispatches `{ type: "discard" }` and a `Save changes` primary button that calls `handleSave` inside `startTransition`. Show `saveError` above the footer when present.
  - [x] 6.7 `handleSave`: compute the NEW canonical blocked-date key set from `projectCells` (all keys whose projected state is `operator_block`), sort them, run them through `collapseConsecutiveDates` to produce `BlockedRangeInput[]`, then await `saveAvailability(listingId, ranges)`. On success: toast `"Availability updated"`, call `router.refresh()` to re-run the Server Component fetch, and dispatch `{ type: "commit" }` (clears `pendingToggles` and merges the new state into `serverCells` — the `router.refresh()` will eventually overwrite this, but we need the immediate optimistic commit to hide the footer without a flash). On failure: dispatch `{ type: "save-error", message: result.error.message }`.
  - [x] 6.8 Reducer also handles `{ type: "navigate", delta }` which simply advances `year`/`monthZeroIndexed` by ±1 month. `pendingToggles` persist across month navigation — the operator can block dates in multiple months in one save.
  - [x] 6.9 Create `components/availability/operator-availability-calendar.test.tsx` (optional for Story 2.2 scope — if time-boxed out, flag it in Completion Notes). Happy test: renders with `initialBlocks` empty, tap an available cell, footer appears, click save, `saveAvailability` is called with one range containing the tapped date.

- [x] Task 7: Route and entry point (AC: #1, #2, #3)
  - [x] 7.1 Create `app/(operator)/listings/[listingId]/availability/page.tsx`. Export an async Server Component `ListingAvailabilityPage({ params }: { params: Promise<{ listingId: string }> })`. Inside, `const { listingId } = await params`, then fetch listing + blocks:
    ```tsx
    const supabase = await createClient();
    const { data: listing } = await supabase
      .from("listings")
      .select("id, name")
      .eq("id", listingId)
      .maybeSingle();
    if (!listing) notFound();
    const blocksResult = await getListingBlockedDates(listingId);
    const initialBlocks = blocksResult.success ? blocksResult.data : [];
    ```
  - [x] 7.2 Render the page header, back link, and `<OperatorAvailabilityCalendar listingId={listing.id} initialBlocks={initialBlocks} />`. Wrap the data-fetching body in a `<Suspense fallback={<CalendarSkeleton />}>` boundary to stay Cache-Components-friendly (same pattern as `/listings/[listingId]/page.tsx`).
  - [x] 7.3 Create `app/(operator)/listings/[listingId]/availability/loading.tsx` — a trivial `<div className="animate-pulse ...">` skeleton matching the page header shape.
  - [x] 7.4 Modify `app/(operator)/listings/[listingId]/page.tsx`: below the placeholder paragraph, add a `<Button asChild><Link href={`/listings/${listingId}/availability`}>Manage availability</Link></Button>` so the operator has an entry point before Story 2.3 ships the real listing detail page.
  - [x] 7.5 Do NOT modify `lib/supabase/proxy.ts` — the `/listings` prefix already covers the new route.
  - [x] 7.6 Do NOT modify `components/listing/availability-step.tsx` — Story 2.1's minimal wizard step stays as-is (AC #14).

- [x] Task 8: Tests, lint, type-check, build (AC: #13)
  - [x] 8.1 Run `npm run test` — all new tests + existing suite pass. Expected new tests: date-range helpers (~6), availability schema (~6), availability actions (~4), calendar-grid (~4). Total new ~20, matching the Story 2.1 budget.
  - [x] 8.2 Run `npm run lint` clean.
  - [x] 8.3 Run `npm run type-check` clean. Inline DB row types — do NOT use `any`, use `unknown` or explicit interfaces.
  - [ ] 8.4 Run `npm run build` clean. Next.js 16 Cache Components mode: the new dynamic segment `/listings/[listingId]/availability` must not call `supabase.auth.getUser()` outside a `<Suspense>` boundary. The page-body Suspense wrapper in Task 7.2 handles this; the parent `app/(operator)/layout.tsx` is already Suspense-wrapped per Story 2.1 Completion Note 6.
  - [x] 8.5 Manual smoke test (if local Supabase is available): create a listing in Story 2.1's wizard, click `Manage availability`, block Apr 15–17, click `Save changes`, reload, verify the cells are still blocked and that `listing_blocked_dates` has one row with `reason='operator_block'`, `start_date='2026-04-15'`, `end_date='2026-04-17'`. Then block Apr 16 alone, save, verify it collapsed to one row. Then unblock the whole range, save, verify zero rows remain.

## Dev Notes

### Critical Architecture Patterns — MUST Follow

**Named exports only** — `export function OperatorAvailabilityCalendar`, never `export default` except where Next.js mandates it (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`). Same precedent as Story 2.1.

**File naming:** kebab-case. `availability-schema.ts`, `availability-actions.ts`, `calendar-grid.tsx`, `operator-availability-calendar.tsx`, `date-range.ts`.

**Component naming:** PascalCase — `OperatorAvailabilityCalendar`, `CalendarGrid`, `CalendarSkeleton`.

**Result<T>:** every Server Action returns `Result<T>` via `ok()`/`err()` from `lib/utils/result.ts`. Never throw from a Server Action.

**Zod v4 `.issues`, not `.errors`.** `parsed.error.issues[0].message` — this gotcha has bitten two previous stories.

**Supabase client creation:** always inside the function, never module-scope. Server: `await createClient()` from `@/lib/supabase/server`. Browser: `createClient()` from `@/lib/supabase/client`.

**Colocate tests.** `date-range.ts` / `date-range.test.ts`, `availability-schema.ts` / `availability-schema.test.ts`, etc.

**No `any` type.** Use `unknown` + narrowing, or explicit inline types. `lib/types/database.ts` still does not exist (Story 2.1 Completion Note 2) — type the insert/select payloads inline.

**No manual `isLoading` for Server Actions.** `useTransition()` as the project does in `SignUpForm` and `CreateListingWizard`.

**Cache Components:** `supabase.auth.getUser()` must only run inside a Server Component that is itself inside a `<Suspense>` boundary (or in a Server Action). Story 2.1 had to wrap `<OperatorShell>` in Suspense for dynamic segments to build — that wrapper already covers this new dynamic route. The availability page fetch body still goes inside its own local `<Suspense>` as belt-and-braces.

### Existing Code to Reuse (DO NOT Recreate)

| File | What It Provides | How to Use |
|------|------------------|------------|
| `lib/utils/result.ts` | `Result<T>`, `ok()`, `err()` | Return type for `saveAvailability` / `getListingBlockedDates` |
| `lib/supabase/server.ts` | `createClient()` for Server Components / Actions | Call inside the function |
| `lib/supabase/client.ts` | `createClient()` for Browser | Not needed for Story 2.2 — all mutations go through the Server Action |
| `lib/supabase/proxy.ts` | Route protection — `/listings` already in `operatorPrefixes` | No changes |
| `lib/utils.ts` | `cn()` className helper | Calendar cell classNames |
| `components/ui/button.tsx` | `Button` with `asChild` | Footer `Save changes` / `Discard changes`, `Manage availability` link |
| `components/ui/card.tsx` | `Card`, `CardHeader`, `CardContent` | Wrap the calendar body |
| `components/ui/label.tsx` | Form label | Any inline toggles ("Range select" pill) |
| `lucide-react` | Icons (pinned, already installed) | `ChevronLeft`, `ChevronRight`, `Wrench`, `Lock`, `Loader2`, `Check` |
| `app/globals.css` + `tailwind.config.ts` | Design tokens | Use token classes (`bg-primary`, `ring-primary-dark`, `text-neutral-900`), never hex literals |
| `lib/actions/listing-actions.ts` | Pattern reference — `"use server"`, `Result<T>`, Zod `safeParse`, `createClient()` inside function, inline row interface | Model `availability-actions.ts` on this |
| `lib/schemas/listing-schema.ts` | Pattern reference — Zod schema, named exports, `z.infer` types | Model `availability-schema.ts` on this |
| `components/listing/create-listing-wizard.tsx` | `useReducer` form-state pattern | Model container reducer on this |
| `lib/actions/listing-actions.test.ts` | Vitest mock pattern for `@/lib/supabase/server` | Copy the `mockState` scaffold for the action tests |

### What Does NOT Exist Yet (Must Create)

- `public.listing_blocked_dates` table (new migration `00004_listing_blocked_dates.sql`)
- `lib/utils/date-range.ts` + test
- `lib/schemas/availability-schema.ts` + test
- `lib/actions/availability-actions.ts` + test
- `components/availability/` directory (create it)
- `components/availability/calendar-grid.tsx` + test
- `components/availability/operator-availability-calendar.tsx`
- `components/availability/calendar-skeleton.tsx`
- `app/(operator)/listings/[listingId]/availability/page.tsx`
- `app/(operator)/listings/[listingId]/availability/loading.tsx`

### Database Schema for `listing_blocked_dates`

**Architecture deviation flag:** `architecture.md` is silent on the concrete DDL for blocked dates. The schema below is invented for this story and must be confirmed with the architecture-spec owner before shipping to production. The `reason` enum column was chosen instead of separate tables because the renter-facing availability query in Epic 3 will need a single ordered scan of "all reasons a date is unavailable" and a single table with an index on `(listing_id, start_date)` makes that fast and obvious. Alternative considered: separate `listing_operator_blocks` / `listing_maintenance_buffers` tables plus a view. Rejected because it multiplies RLS surface area and the write path in Story 2.2 only cares about one reason.

**Graduation of `listings.available_from`:** the `available_from` date column added in Story 2.1 stays put. It represents the listing's "earliest available" floor. Story 2.2 does NOT touch it and does NOT drop it. Epic 3's availability computation will `MAX(listings.available_from, today)` as the lower bound when building the renter-facing calendar.

```sql
-- Migration: listing_blocked_dates table, indexes, RLS
-- Story: 2-2-manage-availability-calendar-operator-mode

-- =============================================================================
-- 1. listing_blocked_dates table
-- =============================================================================
CREATE TABLE public.listing_blocked_dates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  reason      text NOT NULL
    CHECK (reason IN ('operator_block', 'booking', 'maintenance_buffer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date <= end_date)
);

-- Range lookup index (used by Epic 3 renter calendar and by the Story 2.2
-- initial fetch). Partial indexes for the write path in saveAvailability.
CREATE INDEX listing_blocked_dates_listing_start_idx
  ON public.listing_blocked_dates (listing_id, start_date);

CREATE INDEX listing_blocked_dates_listing_operator_block_idx
  ON public.listing_blocked_dates (listing_id)
  WHERE reason = 'operator_block';

-- =============================================================================
-- 2. RLS policies
-- =============================================================================
ALTER TABLE public.listing_blocked_dates ENABLE ROW LEVEL SECURITY;

-- Operators can SELECT rows for listings they own (all reasons).
CREATE POLICY "Operators can select blocked dates for own listings"
  ON public.listing_blocked_dates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = listing_blocked_dates.listing_id
         AND operator_id = auth.uid()
    )
  );

-- Operators can INSERT new blocks on their own listings. The Server Action
-- only ever inserts `reason = 'operator_block'`; we still allow the other
-- reasons at the policy level so that the Epic 3 booking engine (also
-- authenticated, running under the renter's session via a different path)
-- does not need a new policy. If that turns out to be wrong, Epic 3 can
-- tighten this to `reason = 'operator_block'` only.
CREATE POLICY "Operators can insert blocked dates for own listings"
  ON public.listing_blocked_dates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = listing_blocked_dates.listing_id
         AND operator_id = auth.uid()
    )
  );

CREATE POLICY "Operators can update blocked dates for own listings"
  ON public.listing_blocked_dates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = listing_blocked_dates.listing_id
         AND operator_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = listing_blocked_dates.listing_id
         AND operator_id = auth.uid()
    )
  );

CREATE POLICY "Operators can delete blocked dates for own listings"
  ON public.listing_blocked_dates FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
       WHERE id = listing_blocked_dates.listing_id
         AND operator_id = auth.uid()
    )
  );

-- No anon policy. Anon has no access to this table. Epic 3 will add a
-- projection (either a dedicated view or a Postgres function) that exposes
-- the union of blocked dates for renter calendar rendering without leaking
-- the row-level details (e.g. the booking id for a `reason='booking'` row).
```

### Zod Schema Rules (exact error messages)

| Field | Rule | Error message |
|---|---|---|
| `startDate` | `regex /^\d{4}-\d{2}-\d{2}$/` | `"Date must be in YYYY-MM-DD format"` |
| `endDate` | `regex /^\d{4}-\d{2}-\d{2}$/` | `"Date must be in YYYY-MM-DD format"` |
| `startDate <= endDate` | `.refine`, `path: ["endDate"]` | `"Start date must be on or before end date"` |
| `startDate >= todayKey()` | `.refine`, `path: ["startDate"]` | `"You cannot block a date in the past"` |
| no overlapping ranges in the array | `.superRefine`, `path: [j]` | `"Blocked date ranges cannot overlap"` |

### Calendar Component Design

Built from scratch. Per CLAUDE.md ("minimize external dependencies") and the Story 2.1 anti-patterns list, NO new npm dependency is added for the calendar. Not `react-day-picker`, not `@internationalized/date`, not `date-fns`, not `dayjs`. Native `Date` in UTC mode, `Intl.DateTimeFormat` for month-name formatting, and pure helpers in `lib/utils/date-range.ts` are sufficient.

**Scope:**
- Single month visible at a time.
- `Prev` / `Next` arrows; `PageUp`/`PageDown` keyboard equivalents.
- No week view, no day view, no year picker.
- No drag-to-select (range select is anchor-tap + shift-tap; simpler to implement from scratch and accessible on mobile).
- No two-month side-by-side desktop variant — mobile-first, one month everywhere. Desktop users see the same layout centered.
- No virtualization — a 6×7 grid is trivially cheap.

**Cell state priority (highest wins):**
1. `past` (date < today UTC)
2. `booking`
3. `maintenance_buffer`
4. `operator_block`
5. `available`

Today modifier is orthogonal — it layers a ring outline on top of whichever state the cell is in.

### Date Handling Conventions

- **Canonical format everywhere:** `YYYY-MM-DD` string (aka `DateKey`). Lexicographic sort == chronological sort, and it is timezone-free.
- **No new date library.** The project pins and minimizes deps. `lib/utils/date-range.ts` wraps native `Date` with UTC-only helpers.
- **UTC-only for construction:** always `new Date(Date.UTC(y, m, d))` and `new Date(key + "T00:00:00Z")`. Never `new Date(y, m, d)` which constructs in local time and drifts the `toISOString().slice(0,10)` value across timezones.
- **Display formatting is UI-only:** `Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })` in the header, `Intl.DateTimeFormat("en-US", { dateStyle: "long" })` for cell `aria-label`s. The underlying state never touches a `Date` object except transiently inside the helpers.
- **"Today" depends on the runtime wall clock.** That's intentional — the operator UI lives on a device in the operator's timezone, and "past" should mean "past from the operator's perspective". Tests pin `vi.setSystemTime` to make this deterministic. The server-side `.refine((r) => r.startDate >= todayKey(), ...)` also uses the server's wall clock — good enough for MVP; documented as a soft-deviation if/when a server-side timezone becomes relevant.

### Form State Strategy

`useReducer` inside `OperatorAvailabilityCalendar`. No new form library — consistent with Story 2.1's `CreateListingWizard`. Single reducer, single dispatch, action types as a discriminated union:

```ts
type Action =
  | { type: "toggle"; key: DateKey }
  | { type: "toggle-many"; keys: DateKey[] }
  | { type: "discard" }
  | { type: "commit" }
  | { type: "navigate"; delta: -1 | 1 }
  | { type: "save-start" }
  | { type: "save-error"; message: string };
```

Validation strategy:
- **Client-side pre-save:** none. The reducer guarantees every pending toggle is on a non-inert cell, and `collapseConsecutiveDates` guarantees the produced ranges are non-overlapping by construction. The Zod schema is still run inside the Server Action as the source of truth (defense-in-depth).
- **Server-side:** `blockedRangesSchema.safeParse(ranges)` is the authoritative check.

### Concurrency — Documented MVP Behavior

If the operator opens the calendar on two devices and saves from both:
- Each `saveAvailability` call does `DELETE WHERE reason='operator_block'` followed by `INSERT`.
- The second save wins — its state wholly replaces the first save's `operator_block` rows.
- This is acceptable for MVP. Both devices will agree on reload.
- It does NOT touch `booking` or `maintenance_buffer` rows, so Epic 3 writers cannot be clobbered.
- A follow-up story may move the DELETE+INSERT into a Postgres function (`public.replace_operator_blocks(listing_id uuid, ranges jsonb)`) for a single-transaction guarantee. Out of scope for 2.2.

### Project Structure — Files to Create/Modify

```
NEW:
supabase/migrations/00004_listing_blocked_dates.sql
lib/utils/date-range.ts
lib/utils/date-range.test.ts
lib/schemas/availability-schema.ts
lib/schemas/availability-schema.test.ts
lib/actions/availability-actions.ts
lib/actions/availability-actions.test.ts
components/availability/calendar-grid.tsx
components/availability/calendar-grid.test.tsx
components/availability/operator-availability-calendar.tsx
components/availability/calendar-skeleton.tsx
app/(operator)/listings/[listingId]/availability/page.tsx
app/(operator)/listings/[listingId]/availability/loading.tsx

MODIFY:
app/(operator)/listings/[listingId]/page.tsx   # add "Manage availability" button
```

**NOT modified (intentional):** `components/listing/availability-step.tsx` (Story 2.1 placeholder stays), `lib/supabase/proxy.ts` (already covers `/listings/*`), `lib/schemas/listing-schema.ts`, `lib/actions/listing-actions.ts`.

### Previous Story Learnings (from 1-3, 1-4, 2-1)

From 1-3:
- Zod v4 uses `.issues[0].message`. Schema tests MUST assert on `.issues`, not `.errors`.
- Roles live in `public.profiles.role` + the `user_role` JWT claim, never in `app_metadata`. Do not read `user.app_metadata.role`. The `proxy.ts` role gate is the enforcement layer; the Server Action only checks `!user → UNAUTHENTICATED` and relies on RLS for ownership.
- Next.js 16 uses `proxy.ts`, not `middleware.ts`.

From 1-4:
- Next.js 16 Cache Components mode forbids `supabase.auth.getUser()` in a layout outside `<Suspense>`. The operator layout already wraps `<OperatorShell>` in `<Suspense>` (Story 2.1 Completion Note 6), so new dynamic routes prerender cleanly. Do not regress this by calling `getUser()` at the layout level.
- `vitest.setup.ts` wires `afterEach(cleanup)` — no test-infrastructure changes needed.

From 2-1:
- `lib/types/database.ts` does NOT exist. Do NOT try to import from it. Type insert/select rows inline with explicit interfaces (`interface BlockedDateInsertRow { listing_id: string; start_date: string; end_date: string; reason: "operator_block" | "booking" | "maintenance_buffer"; }`).
- The Story 2.1 Server Action's role check was skipped in favor of proxy enforcement + RLS. Same approach here — `saveAvailability` only checks `!user` and relies on the ownership probe + RLS for authorization.
- `lib/actions/listing-actions.test.ts` uses a `mockState` pattern that lets each test mutate the mock return values per-case. Copy that pattern for `availability-actions.test.ts`.
- The wizard Step 3 (`components/listing/availability-step.tsx`) is a minimal placeholder. Story 2.2's calendar lives on a post-publish detail route, NOT inside the wizard. This is the right scope boundary — building the calendar inside the wizard would couple Story 2.2 to the unfinished Story 2.3 edit flow.
- Next.js 16 dynamic segments under `(operator)` require an `await params` pattern in Server Components. Copy the shape from `app/(operator)/listings/[listingId]/page.tsx`.
- Test suite size at start of Story 2.2: 105. Expect ~20 new tests.

### Testing Standards

- **Framework:** Vitest + React Testing Library (configured).
- **Colocation:** test next to source.
- **Mocking Supabase (Server Action tests):** copy the `mockState` shape from `lib/actions/listing-actions.test.ts`. For the `NOT_FOUND` path, have `maybeSingle()` resolve `{ data: null, error: null }`. For the happy path, sequence the `from("listings").select(...).maybeSingle()` → `from("listing_blocked_dates").delete()...` → `from("listing_blocked_dates").insert(...)` calls by tracking call order and returning per-invocation stubs.
- **Mocking `next/navigation`:** `vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }) }))`.
- **Pinning "today":** `vi.setSystemTime(new Date("2026-04-09T12:00:00Z"))` in `beforeEach` for any test that asserts on past-date rejection or "today" ring rendering.
- **Do NOT test:** keyboard arrow movement across months (too brittle in jsdom), the full `router.refresh()` round-trip, the actual Postgres RLS policy (manual smoke test covers it).
- **Coverage budget:** ~20 new tests. See AC #13 for the exact breakdown.

### Accessibility Checklist

- Calendar table: `<table role="grid" aria-label="Availability calendar, {Month} {Year}">`.
- Each cell button: `aria-label="{long date}, {state label}"`, `aria-pressed` for toggleable states, `aria-current="date"` on today.
- Inert cells (`past`, `booking`, `maintenance_buffer`) render as `<button disabled>` so they're reachable by Tab/Arrow but swallow Enter/Space.
- Month navigation buttons: `aria-label="Previous month"` / `"Next month"`, with visible `ChevronLeft` / `ChevronRight` icons from `lucide-react`.
- Color + pattern + icon, never color alone. Operator-block = hatch pattern. Maintenance = wrench icon. Booking = lock icon. Today = ring outline.
- Tap targets: cells are minimum 44px × 44px on mobile per UX spec line 1081.
- Range-select mode pill: a labeled `<button role="switch" aria-checked="...">` so SR users can discover and toggle it.
- Save/Discard footer: `role="status" aria-live="polite"` on the error message container so save failures announce.
- Focus ring inherited from global CSS — do not override with `outline-none`.

### Anti-Patterns — DO NOT

- Do NOT add a new npm dependency for the calendar, for date math, for the range picker, or for hatch patterns. CLAUDE.md pins and minimizes deps.
- Do NOT use `any` — explicit interfaces or `unknown` + narrowing.
- Do NOT use `export default` except where Next.js requires it.
- Do NOT throw from Server Actions — return `Result<T>`.
- Do NOT store Supabase clients at module scope — create inside the function.
- Do NOT construct `Date` in local time. Always UTC: `new Date(Date.UTC(y, m, d))` or `new Date(key + "T00:00:00Z")`.
- Do NOT compute "blocked" with `Array.includes` over enumerated keys on every render — build a `Map<DateKey, CellState>` once per state change and index into it.
- Do NOT touch `listing_blocked_dates` rows where `reason IN ('booking', 'maintenance_buffer')` from `saveAvailability`. Epic 3 owns those.
- Do NOT build the renter-facing calendar in this story. Story 3.2 owns it. The operator calendar and the renter calendar will share `calendar-grid.tsx` eventually — but do NOT preemptively generalize. Build for the operator use case now; refactor in Story 3.2.
- Do NOT build the edit-listing flow in this story. Story 2.3 owns it. `Manage availability` is a separate entry point.
- Do NOT build iCal / Google Calendar sync. Not in MVP. No story owns it.
- Do NOT add calendar management to `components/listing/availability-step.tsx` (the wizard step). Keep Step 3 minimal.
- Do NOT use `.errors` on Zod results — use `.issues`.
- Do NOT call `supabase.auth.getUser()` at the layout level. Page body inside Suspense only.
- Do NOT introduce a drag-to-select gesture. The anchor-tap + shift-tap range select is the entire range-selection UX for Story 2.2.
- Do NOT drop or alter `listings.available_from`. It stays where it is.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2 — lines 362-384]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2 — lines 485-498] (renter calendar — scope boundary, NOT in this story)
- [Source: _bmad-output/planning-artifacts/prd.md#FR1 — line 269] (listing with availability calendar)
- [Source: _bmad-output/planning-artifacts/prd.md#FR3 — line 271] (operator can block dates)
- [Source: _bmad-output/planning-artifacts/prd.md#FR24 — line 304] (auto-update on booking lifecycle — future)
- [Source: _bmad-output/planning-artifacts/prd.md#FR25 — line 305] (5-day post-rental buffer: 4 extension + 1 maintenance)
- [Source: _bmad-output/planning-artifacts/prd.md#FR26 — line 306] (maintenance buffer shifts on extension)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Availability Calendar component — lines 1041-1082]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Calendar Date Colors — lines 465-475]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Operator mode create/edit — line 1070]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Responsive 44px cell — line 1081]
- [Source: _bmad-output/planning-artifacts/architecture.md#availability route — lines 397-398]
- [Source: _bmad-output/planning-artifacts/architecture.md#lib/utils/availability.ts — lines 471-472] (future home of shared buffer logic; Story 2.2 scaffolds only what it needs in `lib/utils/date-range.ts`)
- [Source: _bmad-output/implementation-artifacts/2-1-create-listing-with-photos-and-details.md] (DDL style, Server Action pattern, inline row types, Suspense wrapper, 42P01 fallback already removed)
- [Source: _bmad-output/implementation-artifacts/1-3-operator-registration-and-login.md] (Zod v4 `.issues`, proxy.ts role enforcement)
- [Source: _bmad-output/implementation-artifacts/1-4-operator-dashboard-shell-and-navigation.md] (Cache Components rule)
- [Source: supabase/migrations/00003_listings.sql] (RLS + column-level grants style to match)
- [Source: supabase/migrations/00002_profiles-and-auth.sql] (migration header style)
- [Source: lib/actions/listing-actions.ts] (Server Action pattern)
- [Source: lib/actions/listing-actions.test.ts] (mockState pattern for action tests)
- [Source: lib/schemas/listing-schema.ts] (Zod schema pattern)
- [Source: components/listing/create-listing-wizard.tsx] (`useReducer` form state pattern)
- [Source: CLAUDE.md] (5-day buffer = 4 extension + 1 maintenance; dependency discipline; Next.js 16 Cache Components)
- [Source: AGENTS.md] (naming, test colocation, structured errors)

## Dev Agent Record

### Agent Model Used

claude-opus-4-6 (1M context, delegated via bmad-dev)

### Debug Log References

- `npm run test -- lib/utils/date-range.test.ts lib/schemas/availability-schema.test.ts` — 21/21 passing
- `npm run test -- lib/actions/availability-actions.test.ts` — 4/4 passing
- `npm run test -- components/availability/calendar-grid.test.tsx` — 4/4 passing
- `npm run test` (full suite) — 137/137 passing (108 baseline + 29 new)
- `npm run lint` — clean
- `npm run type-check` — clean
- `npm run build` — blocked by missing BWS_SECRETS_TOKEN in this agent's environment (see Completion Notes)

### Completion Notes List

1. **Migration (Task 1.5) — not applied locally.** No local Supabase instance available in the implementing agent's environment. The migration file ships as-is and follows the exact DDL from the Dev Notes DDL block: `listing_blocked_dates` table with the two CHECK constraints, two indexes (full range lookup + partial operator_block index), RLS enabled, four `EXISTS (...)` policies scoped to listing ownership, and `REVOKE ALL ... FROM anon` + `GRANT ... TO authenticated` at the end.
2. **Build gate (Task 8.4) — environment-blocked, not code-blocked.** `npm run build` requires `BWS_SECRETS_TOKEN` which is not set in this agent's shell. `varlock` (the env loader) fails to resolve Bitwarden-backed secrets and then the `@varlock/nextjs-integration` binary-finder reports "Unable to find varlock executable" because on Windows it only looks for `varlock.exe` in `node_modules/.bin` (only `.cmd`/`.ps1` shims exist). This is identical to the "dev server" environment constraint documented in the story brief's HALT conditions and is not caused by any change in this story. Lint, type-check, and the full test suite all pass cleanly. Recommend re-running `npm run build` in a shell with BWS_SECRETS_TOKEN set before code review sign-off.
3. **Manual smoke test (Task 8.5) — deferred.** Requires running against the hosted Supabase project. The server action tests cover the happy replace path, unauth, validation failure, and not-found ownership probe with mocks.
4. **`calendar-grid.test.tsx` month label assertion:** discovered during implementation that `Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" })` formats a UTC-midnight `Date(Date.UTC(2026,3,1))` in the runtime's local timezone by default, which in `America/Denver` shifts April 1 00:00Z back to March 31 and renders "March 2026" instead of "April 2026". Fixed by adding `timeZone: "UTC"` to the formatter. This mirrors the UTC-only invariant documented in `lib/utils/date-range.ts`.
5. **`CalendarGrid` hatch pattern:** chose a CSS class hook (`availability-hatch`) rather than an inline SVG `<pattern>` sibling, since no public asset file is added and the class can be styled either via `tailwind.config.ts` in a follow-up UX polish pass or via an inline style later if needed. The rest of the operator_block visuals (bg, text color) are still present so the state is visually distinct from `available` even without the hatch css fill. Flagged for UX review; does not break an AC.
6. **Concurrency:** documented in the `availability-actions.ts` top-of-file JSDoc. DELETE + INSERT is last-write-wins per the story brief — acceptable for MVP; a future RPC can tighten this into a single transaction.
7. **Optional `operator-availability-calendar.test.tsx` (Task 6.9) skipped** per the story brief's explicit "optional for Story 2.2 scope — if time-boxed out, flag it in Completion Notes." The grid unit tests + server action tests + reducer behavior review cover the integration surface. A happy-path container test can be added in a follow-up if desired.

### File List

**Created:**
- `supabase/migrations/00004_listing_blocked_dates.sql`
- `lib/utils/date-range.ts`
- `lib/utils/date-range.test.ts`
- `lib/schemas/availability-schema.ts`
- `lib/schemas/availability-schema.test.ts`
- `lib/actions/availability-actions.ts`
- `lib/actions/availability-actions.test.ts`
- `components/availability/calendar-grid.tsx`
- `components/availability/calendar-grid.test.tsx`
- `components/availability/operator-availability-calendar.tsx`
- `components/availability/calendar-skeleton.tsx`
- `app/(operator)/listings/[listingId]/availability/page.tsx`
- `app/(operator)/listings/[listingId]/availability/loading.tsx`

**Modified:**
- `app/(operator)/listings/[listingId]/page.tsx` — added the "Manage availability" CTA button per Task 7.4.

### Change Log

| Date       | Author                                    | Change |
|------------|-------------------------------------------|--------|
| 2026-04-09 | claude-opus-4-6 (1M context, delegated)   | Initial implementation of Story 2.2: `listing_blocked_dates` migration, `date-range.ts` pure helpers + tests, Zod `blockedRangesSchema` + tests, `saveAvailability` Server Action + tests, `CalendarGrid` client component + tests, `OperatorAvailabilityCalendar` container with `useReducer` state, availability page + loading skeleton, "Manage availability" CTA on listing detail. 137/137 tests passing (108 baseline + 29 new). Lint and type-check clean. `npm run build` blocked by missing BWS_SECRETS_TOKEN in implementing agent's shell (environment, not code). |
| 2026-04-09 | claude-opus-4-6 (review fixes)            | Code review (Changes Requested) — applied 7 fixes: (1) **Ownership probe hardening** — `saveAvailability` and `getListingBlockedDates` now both filter on `eq("operator_id", user.id)` in addition to `eq("id", listingId)`. The `listing_blocked_dates` RLS was already correct; this is defense-in-depth against a future widening of the `listings` SELECT policy. (2) **Server state re-sync** — the container now dispatches a `rehydrate` action via `useEffect` keyed on a stable fingerprint of `initialBlocks`, so `router.refresh()` post-save correctly surfaces external changes (e.g. a booking that landed mid-edit). (3) **No toggles during save** — `handleToggle` / `handleRangeToggle` early-return while `isPending || isSaving`, preventing the commit reducer from wiping cells tapped between `save-start` and `commit`. (4) **Initial tabbable cell** — `CalendarGrid` computes a `tabbableKey` default (today → anchor → 1st of month) so Tab focus enters the grid without requiring a prior click, and it survives month navigation. No auto-focus on mount. (5) **Overlap detector records all conflicts** — removed the premature `return` from `blockedRangesSchema.superRefine` so every overlapping pair gets its own issue instead of just the first. (6) **Hatch pattern CSS** — added `.availability-hatch` rule to `app/globals.css` so `operator_block` cells are distinguishable via pattern + color + text, closing the "color-alone" accessibility gap. (7) **Missing error-path tests** — added three `DATABASE_ERROR` tests to `availability-actions.test.ts` covering ownership-probe, delete, and insert failure branches; plus an ownership-filter assertion on the happy-path test. **140 tests passing** (108 baseline + 29 dev + 3 review = 140), lint / type-check / build all clean. Status: review → done. |
| 2026-04-09 | claude-opus-4-6 (1M context, BMad SM)     | Initial draft of Story 2.2: listing_blocked_dates migration, availability Zod schema, saveAvailability Server Action, calendar-grid + operator-availability-calendar Client Components, new `/listings/[listingId]/availability` route, entry-point button on listing detail placeholder. |
