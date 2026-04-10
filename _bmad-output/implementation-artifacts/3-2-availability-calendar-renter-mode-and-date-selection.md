# Story 3.2: Availability Calendar (Renter Mode) & Date Selection

Status: done

## Story

As a **renter**,
I want to see live availability and select my rental dates with a running cost total,
so that I know exactly what's available and what it costs before committing.

## Acceptance Criteria

1. **`bookings` + `booking_dates` schema lands now, ahead of Story 3-5.** A new migration `supabase/migrations/00005_bookings.sql` creates both tables even though Story 3-5 is the one that actually inserts bookings. The reason: Story 3-2 needs a stable anon-visible read surface for "this date is booked" that survives the transition from Story 3-2 (calendar only) to Story 3-5 (calendar + booking writes) without a schema re-shuffle. The migration is read-surface-complete and write-surface-permissive; Story 3-5 will tighten WITH CHECK clauses and add the transactional Server Action.
   - `public.bookings`: `id uuid pk`, `listing_id uuid fk listings(id) ON DELETE CASCADE`, `renter_id uuid nullable fk auth.users(id) ON DELETE SET NULL` (nullable until Story 3-3 lands OTP auth; Story 3-5 flips to NOT NULL), `status text CHECK IN ('pending','confirmed','cancelled','completed','no_show') DEFAULT 'pending'`, `start_date date`, `end_date date`, `total_cents integer CHECK >= 0`, `stripe_payment_intent_id text`, `contract_id uuid`, `created_at / updated_at timestamptz`, `CHECK (start_date <= end_date)`, plus the standard `set_updated_at` trigger reused from migration 00003.
   - `public.booking_dates`: composite PK `(booking_id, date)` plus a critical `UNIQUE (listing_id, date)` constraint — this is the DB-level guarantee against double-booking that Story 3-5 will rely on to convert concurrent-write races into clean `BOOKING_CONFLICT` errors (FR23, Story 3.5 AC).
   - Indexes: `bookings_listing_id_idx`, partial `bookings_renter_id_idx WHERE renter_id IS NOT NULL`, `bookings_status_idx`, `booking_dates_listing_date_idx`.
2. **RLS on `bookings` is private; RLS on `booking_dates` exposes a narrow anon read surface.** `bookings` has zero anon grants — the row contains `stripe_payment_intent_id`, `contract_id`, and `renter_id` which must never leak to an unauthenticated browser. `booking_dates` has a column-level grant of `(listing_id, date)` to anon (never `booking_id` or `created_at`), guarded by a permissive `USING (true)` select policy. This mirrors the Story 2.1 column-level grant pattern on `listings` where anon is denied `pickup_instructions`. Operators get row-level read via `EXISTS (SELECT 1 FROM listings WHERE id = <row>.listing_id AND operator_id = auth.uid())`. Renters get row-level read on their own bookings (and their own booking_dates, joined through `bookings`).
3. **The 5-day post-rental buffer is enforced in application code, not in the schema.** Story 3-5's Server Action will insert both (a) the `booking_dates` rows for `start..end` and (b) `listing_blocked_dates` rows flagged `reason = 'maintenance_buffer'` for `end + 1 .. end + 5`. We are NOT adding a trigger or generated column to enforce the buffer — keeping the policy in TypeScript makes it trivial to evolve (e.g., "4 + 1 is now 3 + 2" becomes a constant change). The migration documents this decision inline so a future reader knows where the rule lives. The renter calendar renders the buffer via `listing_blocked_dates.reason = 'maintenance_buffer'` → state `'maintenance'`.
4. **Anon can also read `listing_blocked_dates` now.** Story 2.2 shipped `listing_blocked_dates` with zero anon access and a comment promising that Story 3-2 would layer on "a projection view or a Postgres function." We take the simpler path: a permissive `USING (true)` policy plus a column-level grant of `(listing_id, start_date, end_date, reason)` to anon. No view, no SECURITY DEFINER function. The three columns are exactly what the renter calendar needs to colour cells, and nothing else leaks.
5. **Both availability tables are added to the `supabase_realtime` publication.** The migration runs an idempotent `DO $$ ... $$` block that adds `public.booking_dates` and `public.listing_blocked_dates` to the `supabase_realtime` publication if they are not already members. This is what allows the client-side Supabase Realtime subscription in `BookingFlow` to observe `postgres_changes` events on those two tables as anon, without any session.
6. **Public availability fetch helper (Server Component–only).** A new module `lib/services/public-availability.ts` exports `fetchPublicAvailability({ listingId, startDate, endDate }): Promise<Result<AvailabilityDate[]>>` where `AvailabilityDate = { date: DateKey; state: AvailabilityDateState }` and `AvailabilityDateState = 'available' | 'booked' | 'blocked' | 'maintenance' | 'past'`. The helper:
   - Uses `createClient()` from `@/lib/supabase/server` so it resolves as anon when no session cookie is present (the typical renter).
   - Queries `listing_blocked_dates` for any row overlapping the window, and `booking_dates` for rows inside the window.
   - Computes past dates in TypeScript from `todayKey()`, not in SQL. This keeps the service trivially unit-testable with a mocked Supabase client and a `vi.setSystemTime(...)`.
   - Collapses state in priority order: `past > booked > blocked > maintenance > available`. A date that is booked AND in the past renders as `past`. A date that is both an operator block and a maintenance buffer renders as `maintenance` (maintenance is the more specific reason).
   - Returns `err("DATABASE_ERROR", ...)` when either underlying query errors, or when `startDate > endDate`.
   - The `Result<T>` shape matches `lib/utils/result.ts` used by Server Actions — we reuse it here for a non-Action service because Story 3-1 established the precedent of shaping all data-fetch helpers as `Result` returners.
7. **Renter-mode availability calendar component (client).** `components/booking/renter-availability-calendar.tsx` is a purely presentational Client Component. It takes month + availability + current selection as props and emits `onPickDate` and `onNavigate` callbacks. It does NOT fetch, does NOT own selection state, and does NOT subscribe to Realtime — those live in the parent `BookingFlow` so the calendar remains 100% deterministic under test.
   - Each cell's visual role is computed from `(state, selectedStart, selectedEnd)`:
     - `available`: `bg-white text-neutral-900 hover:bg-neutral-100`, plus a subtle `bg-success` dot in the top-right corner (hidden when the cell is part of the selection).
     - `booked` / `blocked`: `bg-neutral-100 text-neutral-400 cursor-default`, `disabled`.
     - `maintenance`: `bg-neutral-200 text-neutral-600 cursor-default`, `disabled`, with a `Wrench` icon from `lucide-react` in the top-right.
     - `past`: `bg-neutral-100 text-neutral-300 cursor-default`, `disabled`.
     - `today`: an additional `ring-2 ring-primary-dark ring-inset` on top of whatever the base state is.
     - `selected-single`: `rounded-md bg-primary text-white` (primary amber `#E87B35`).
     - `selected-start`: `rounded-l-md bg-primary text-white`.
     - `selected-end`: `rounded-r-md bg-primary text-white`.
     - `in-range`: `bg-primary/20 text-neutral-900` — Tailwind opacity-modulated primary as the peach fill called out in the UX spec.
   - Accessibility:
     - The grid is a real `<table role="grid">` with `<th scope="col">` headers for the seven day letters.
     - Each cell is a real `<button>` inside a `<td role="gridcell">`.
     - Inert cells (past, booked, blocked, maintenance) use the native `disabled` attribute — no click handler runs and keyboard Enter/Space is absorbed silently.
     - Selected cells set `aria-pressed`; today sets `aria-current="date"`; each cell's `aria-label` is `"{long date}, {state label}"` e.g. `"April 11, 2026, available"` or `"April 13, 2026, maintenance buffer"`.
     - A live-polite `<div role="status" className="sr-only">` slot at the top of the calendar announces the current selection summary (`"Selected April 11, 2026 to April 12, 2026, 2 days, $700.00"`) whenever the parent updates the `selectionSummary` prop.
     - Keyboard: `ArrowLeft` / `ArrowRight` / `ArrowUp` / `ArrowDown` move focus by ±1 day / ±7 days. Arrow navigation across a month boundary calls `onNavigate(±1)` and moves focus into the new month. `Enter` / `Space` fires `onPickDate` on the focused cell unless inert. `PageUp` / `PageDown` navigate months. Focus uses a roving `tabIndex={0}` on the currently-focused date (or today, or the 1st of the month if today is out of view) and `tabIndex={-1}` on every other cell. A `useRef<Map<DateKey, HTMLButtonElement>>` holds cell handles so the `useEffect` that commits `focusedKey` into `.focus()` works across month changes.
8. **Sticky bottom bar component (client).** `components/booking/booking-sticky-bar.tsx` is a fixed-to-the-bottom bar that slides up via `translate-y-full → translate-y-0` with `transition-transform duration-200 ease-out`. Props: `startDate / endDate / totalDays / totalCents / isVisible / onBookNow`. The bar shows:
   - Left side: a `"Apr 11 – Apr 12"` range label (or `"Apr 11 – Select return date"` when only start is set), and below it `"{n} days · ${total}"`.
   - Right side: a `<Button>` reading `"Book Now"`, `disabled` until both dates are chosen.
   - The `$total` cents value is run through a `useAnimatedCounter(target, 300)` hook: on target change, `requestAnimationFrame` eases from the previous value to the target over 300ms (ease-out-quad). On first mount the counter short-circuits to the target so tests that assert the initial display don't need to advance fake timers. A `useRef` holds the `from` value so the next change animates from the last-rendered value, not the target.
   - The bar has `data-testid="booking-sticky-bar"` and `data-visible` / `aria-hidden` mirrors of `isVisible` to make tests deterministic.
   - Story 3-3 will replace `onBookNow` with a `router.push('/book/[listingId]/verify')`; Story 3-2 leaves the callback as a prop stub.
9. **URL-backed selection state.** `components/booking/use-booking-date-selection.ts` is a custom hook that treats `?start=YYYY-MM-DD&end=YYYY-MM-DD` as the single source of truth for the current selection. It reads via `useSearchParams()` and writes via `router.replace(pathname + ?..., { scroll: false })`. Rules:
   - First pick (no `start`): sets `start = picked`, clears `end`.
   - Second pick (`start` set, no `end`):
     - If `picked === start`: clears both ends.
     - If `picked < start`: resets `start = picked`, `end = null` (treat as a new beginning).
     - If `picked > start`: sets `end = picked`.
   - Third pick (`start` and `end` both set): treats the new pick as a fresh `start`, `end = null`.
   - `reset()`: clears both params.
   - `totalCentsFor(dailyRateCents)`: multiplies `totalDays` (inclusive day count) by the rate. Total days uses `enumerateDateRange(start, end).length`, so a same-day pick is 1 day.
   - Malformed query params (`?start=nope`) are ignored — the regex guard `/^\d{4}-\d{2}-\d{2}$/` treats them as if absent.
   - Story 3-6 will decide whether to layer Zustand on top for multi-step booking-flow state. For Story 3-2, URL params are strictly enough — they survive refresh, they are trivially shareable, and they don't add a dependency.
10. **Client-side `BookingFlow` wrapper owns fetching, subscription, and validation.** `components/booking/booking-flow.tsx` is the Client Component the Server page renders. It accepts `{ listingId, dailyRateCents, initialAvailability, initialYear, initialMonthZeroIndexed }` — the initial month's availability is hydrated from the Server Component so the first paint is fully populated with no client-side flicker.
   - Month navigation: `currentWindow` state holds `{ year, monthZeroIndexed, startKey, endKey }`. `handleNavigate(delta)` advances the window by ±1 month, clamped to `minMonthKey` (the first of the current month, computed once at mount). Past months are literally unreachable from the Previous button and from arrow-key navigation.
   - Subsequent months (user taps Next) trigger a browser-side fetch via an inline `fetchAvailabilityBrowser()` helper that uses `@/lib/supabase/client`. It mirrors the server helper's priority collapse, not the server function itself, because Server Actions would add a round-trip to something that can run straight from the browser as anon.
   - Supabase Realtime: on mount, `createClient()` (browser) opens a channel `listing-availability-{listingId}` with two `postgres_changes` subscriptions — one on `booking_dates` filtered by `listing_id=eq.<id>`, one on `listing_blocked_dates` filtered by `listing_id=eq.<id>`. On any event, re-fetch the current month. If the event was on `booking_dates` AND the current selection intersects a now-unavailable date, clear the selection via `selection.reset()` and set a `conflictMessage` banner: `"Sorry, these dates were just booked. Please select different dates."` The subscription is torn down on unmount via `supabase.removeChannel(channel)`.
   - Range validation at pick time: when the user picks a second date and the candidate end is AFTER the start, the parent enumerates `[start..end]` and scans the availability map for any non-available cell. If it finds one, it refuses the pick and shows a conflictMessage: `"That range includes unavailable dates — please pick a different end date."` The selection is NOT advanced. This prevents the renter from "trapping" a booked day inside a selected range via two taps that sandwich it.
   - The flow renders the calendar, the sticky bar, a 128px-tall spacer (so the last row of the calendar isn't occluded by the sticky bar), and an `alert`-role conflict banner above the calendar when set.
11. **Server page wires in the client flow.** `app/(renter)/book/[listingId]/page.tsx` (from Story 3-1) is extended to compute the current-month window, call `fetchPublicAvailability` server-side for the initial paint, and pass the result plus `listingId / dailyRateCents / year / monthZeroIndexed` into `<BookingFlow />`. The existing above-the-fold content (carousel, title, rate, pickup, description) stays Server-rendered. The layout spacing from Story 3-1 is preserved.
12. **Realtime channel uses the browser Supabase client as anon.** The migration publishes both tables to `supabase_realtime`. The browser client creates the channel without any auth token beyond the publishable key. This works because `anon` has SELECT on `(listing_id, date)` of `booking_dates` and on `(listing_id, start_date, end_date, reason)` of `listing_blocked_dates`; realtime payloads respect those grants. No SECURITY DEFINER function is required.
13. **Tests:** the following test files are colocated and green:
    - `lib/services/public-availability.test.ts` — covers clean window, past-date coercion, operator-block range, maintenance buffer range, booking row wins over operator block, past wins over booked, `startDate > endDate` guard, and query-error propagation. Supabase mocked with a thenable chainable builder.
    - `components/booking/renter-availability-calendar.test.tsx` — renders month label + grid + 7 day headers; renders past / available / booked / blocked / maintenance states; onPickDate fires only on available cells; selected-start / in-range / selected-end roles render for a range; Previous button disabled at `minMonthKey` floor; Next button fires `onNavigate(1)`; Enter key on focused cell fires `onPickDate`; ArrowRight moves focus to the next day; live `role="status"` region surfaces `selectionSummary`.
    - `components/booking/booking-sticky-bar.test.tsx` — hidden when no start; "Select return date" + disabled CTA when only start; enabled CTA + correct range/total labels when both; `onBookNow` fires on click; animated counter reaches the new target after advancing fake timers 400ms (rAF polyfilled to setTimeout for jsdom).
    - `components/booking/use-booking-date-selection.test.ts` — empty start; reads existing params; ignores malformed; pickDate on empty sets start; pickDate after start sets end; pickDate earlier than start resets start; pickDate equal to start clears; pickDate after complete range starts fresh; `reset()` clears; `totalCentsFor` math. `next/navigation` mocked with a stateful `useSearchParams`.
    - The migration is not directly tested by a unit — a smoke test would require a live DB client and we don't have that plumbing. The uniqueness guarantee is documented here as manual-verification-in-Story-3-5, where the Server Action will assert that a collision becomes `BOOKING_CONFLICT`.
14. **Quality gates:** `npm run test`, `npm run lint`, `npm run type-check` and `npm run build` are all clean. No new npm dependencies added.

## Tasks / Subtasks

- [x] Task 1: Migration 00005 — bookings + booking_dates + anon read surfaces + realtime publication (AC: #1, #2, #3, #4, #5)
  - [x] 1.1 Create `supabase/migrations/00005_bookings.sql` with the `bookings` table, indexes, reused `set_updated_at` trigger, and the constraint set from AC #1.
  - [x] 1.2 Create the `booking_dates` table with composite PK, `UNIQUE (listing_id, date)`, and the `booking_dates_listing_date_idx`.
  - [x] 1.3 Add RLS policies on `bookings`: operator-owned-listing SELECT, renter-owned SELECT, renter-owned INSERT / UPDATE (the latter two will be tightened in Story 3-5), operator UPDATE for their listings. `REVOKE ALL ... FROM anon`.
  - [x] 1.4 Add RLS policies on `booking_dates`: operator-read-own, renter-read-own-through-bookings, permissive public SELECT. Column-level `GRANT SELECT (listing_id, date) ON public.booking_dates TO anon`. Authenticated renter INSERT with a join-through check.
  - [x] 1.5 Add the permissive public SELECT policy on `listing_blocked_dates` and the column-level `GRANT SELECT (listing_id, start_date, end_date, reason) ON public.listing_blocked_dates TO anon` so the calendar can read blocks as anon.
  - [x] 1.6 Add both tables to the `supabase_realtime` publication inside an idempotent `DO $$ ... $$` guard.
  - [x] 1.7 Inline-comment every design decision (renter_id nullable now / tightened in 3-5; 5-day buffer lives in app code; anon column-grant parity with Story 2.1; why no SECURITY DEFINER function).

- [x] Task 2: Public availability service helper (AC: #6)
  - [x] 2.1 Create `lib/services/public-availability.ts`. Export `AvailabilityDateState` string union, `AvailabilityDate` interface, `AvailabilityFetchError`, `FetchPublicAvailabilityOptions`, and `fetchPublicAvailability(...)`.
  - [x] 2.2 Query `listing_blocked_dates` with `.select("start_date, end_date, reason").eq("listing_id", listingId).lte("start_date", endDate).gte("end_date", startDate)` — overlap predicate via the two inequalities.
  - [x] 2.3 Query `booking_dates` with `.select("date").eq("listing_id", listingId).gte("date", startDate).lte("date", endDate)`.
  - [x] 2.4 Build a state map via priority collapse: walk blocked rows first (maintenance vs block vs booking reason), then overwrite with booking rows (booking wins over block/maintenance), then in the output loop overwrite with `past` when `key < today`.
  - [x] 2.5 Return `err("DATABASE_ERROR", ...)` on any query error or on `startDate > endDate`.
  - [x] 2.6 Colocate `public-availability.test.ts`. Mock `@/lib/supabase/server` with a thenable chainable builder that dispatches on table name. Pin `vi.setSystemTime(new Date("2026-04-10T12:00:00Z"))` so `past` tests are deterministic.

- [x] Task 3: URL-backed selection hook (AC: #9)
  - [x] 3.1 Create `components/booking/use-booking-date-selection.ts` as a Client module. Read the current selection via `useSearchParams()`, write via `router.replace(pathname?..., { scroll: false })`.
  - [x] 3.2 Export `BookingDateSelection` interface and `useBookingDateSelection()` hook. Provide `startDate`, `endDate`, `selectedDates`, `totalDays`, `pickDate`, `reset`, `setRange`, `totalCentsFor`.
  - [x] 3.3 Implement the four-case `pickDate` rules from AC #9 and guard malformed params with a regex.
  - [x] 3.4 Colocate `use-booking-date-selection.test.ts` with a stateful `useSearchParams` mock. Cover every rule + `totalCentsFor` + `reset`.

- [x] Task 4: Renter availability calendar component (AC: #7)
  - [x] 4.1 Create `components/booking/renter-availability-calendar.tsx` as a pure presentational Client Component. Use `buildMonthGrid` + `fromDateKey` + `toDateKey` + `DateKey` from `lib/utils/date-range.ts`.
  - [x] 4.2 Render the month navigation header with prev / next buttons, disabling prev when `monthPrefix <= minMonthKey.slice(0,7)`.
  - [x] 4.3 Render the seven day-header row as `<th scope="col">`.
  - [x] 4.4 Render each cell as a `<button>` inside `<td role="gridcell">`. Compute `cellRoleFor(key, start, end)` and `cellClassName(state, role, isToday)` functions. Disable inert cells.
  - [x] 4.5 Accessibility: `aria-label="{long date}, {state label}"`, `aria-pressed` on selected, `aria-current="date"` on today, roving `tabIndex`, `role="grid"` on the `<table>`. Add a `<div role="status" className="sr-only">` for the selection summary.
  - [x] 4.6 Keyboard handler: Enter/Space/PageUp/PageDown/Arrow keys. Cross-month arrow navigation calls `onNavigate` then commits `focusedKey` so the new-month `useEffect` can `.focus()` the target.
  - [x] 4.7 Render the `maintenance` wrench icon and the `available` green dot as `absolute` corner markers.
  - [x] 4.8 Colocate `renter-availability-calendar.test.tsx`. Pin system time. Cover: month label + grid + column headers; state rendering (past / available / booked / blocked / maintenance); onPickDate on click for available + ignore on inert; selected-start / in-range / selected-end roles via `data-role`; Previous disabled at floor; Next fires onNavigate; Enter fires onPickDate on focused cell; ArrowRight moves focus; live status region exposes the summary.

- [x] Task 5: Sticky bottom bar component (AC: #8)
  - [x] 5.1 Create `components/booking/booking-sticky-bar.tsx`. Export the `BookingStickyBarProps` interface and the named `BookingStickyBar` component.
  - [x] 5.2 Render a fixed-bottom div with `transition-transform duration-200 ease-out` and a `translate-y-full` ↔ `translate-y-0` toggle driven by `isVisible`.
  - [x] 5.3 Left-side labels: "Select dates" / "Apr 11 – Select return date" / "Apr 11 – Apr 12", plus a second line of `"{n} days · ${total}"` (or `"Select return date"` when only start).
  - [x] 5.4 Right-side `Button` — disabled until both dates set, calls `onBookNow` on click.
  - [x] 5.5 Implement `useAnimatedCounter(target, 300)` locally in the file. Ease-out-quad via rAF. Short-circuit the first render to the target.
  - [x] 5.6 Colocate `booking-sticky-bar.test.tsx`. Polyfill rAF as `setTimeout(cb, 0)` via `vi.stubGlobal`. Cover: hidden when not visible; "Select return date" + disabled CTA when only start; enabled CTA + correct labels when both; `onBookNow` fires on click; animated counter advances to new target after fake-timer advance.

- [x] Task 6: Client BookingFlow wrapper (AC: #10, #12)
  - [x] 6.1 Create `components/booking/booking-flow.tsx`. Accept the Server-side initial availability as a prop.
  - [x] 6.2 Hold `currentWindow` state and compute `minMonthKey` via `todayKey()` truncated to the 1st of this month. Clamp prev navigation against it.
  - [x] 6.3 Implement `fetchAvailabilityBrowser(listingId, start, end)` inline using `@/lib/supabase/client`. Mirrors the server helper's priority-collapse logic.
  - [x] 6.4 `useEffect` that re-fetches availability whenever `currentWindow` changes — skipping the initial render, which is already server-hydrated. Cancellation flag guards against unmount-while-fetching.
  - [x] 6.5 `useEffect` that opens a Supabase Realtime channel `listing-availability-{listingId}` with two `postgres_changes` subscriptions. On `booking_dates` events, re-fetch and validate the selection. If the selection now intersects a non-available cell, `selection.reset()` and set the conflict banner. On `listing_blocked_dates` events, just re-fetch.
  - [x] 6.6 Implement `handlePickDate(key)`: if the user is picking an end date AFTER the start, enumerate the candidate range and reject with a banner if any cell is non-available. Otherwise delegate to `selection.pickDate(key)`.
  - [x] 6.7 Compute `selectionSummary` from the current selection and pass it down to the calendar for the live-region announcement.
  - [x] 6.8 Render conflict banner (role="alert"), the calendar, a 128px spacer, and the sticky bar.

- [x] Task 7: Wire the server page into BookingFlow (AC: #11)
  - [x] 7.1 Update `app/(renter)/book/[listingId]/page.tsx` to compute the current-month window, call `fetchPublicAvailability`, and pass `{ listingId, dailyRateCents, initialAvailability, initialYear, initialMonthZeroIndexed }` into `<BookingFlow />`.
  - [x] 7.2 Preserve the Story 3-1 above-the-fold layout (carousel, title, rate, pickup, description).

- [x] Task 8: Quality gates (AC: #14)
  - [x] 8.1 `npm run test` — 269/269 tests pass across 36 files.
  - [x] 8.2 `npm run lint` — clean (2 pre-existing warnings in `scripts/dev-with-bws.mjs`, unrelated to this story).
  - [x] 8.3 `npm run type-check` — clean.
  - [x] 8.4 `npm run build` — clean. Static-prerendered + dynamic routes all resolve; `/book/[listingId]` listed under partial-prerender.

- [x] Task 9: Sprint status update
  - [x] 9.1 `sprint-status.yaml`: set `3-2-availability-calendar-renter-mode-and-date-selection: done` and `last_updated: 2026-04-10`.

## Dev Notes

### Why land the `bookings` schema now instead of in Story 3-5

Story 3-5 is the one that actually inserts bookings, so the natural instinct is to defer all schema work there. Three reasons to land it now:

1. The renter calendar needs a stable anon-visible read surface. If we stub it as "empty set" today, Story 3-5 has to ship a migration AND a calendar-re-fetch AND a query-shape change in the same sprint. Shipping the schema early is a one-line addition for the calendar helper (`booking_dates` join stays identical when bookings are actually inserted) and a clean separation of concerns for 3-5 (it only has to write, not redesign reads).
2. The Supabase Realtime subscription needs a real table to watch. If we ship Story 3-2 with just `listing_blocked_dates`, then Story 3-5 has to ship another migration AND a client-side subscription change AND backfill the conflict-detection path. Worse, the publication change wouldn't compose cleanly with the migration that creates `booking_dates` in Story 3-5 because both would need to touch `supabase_realtime`.
3. The `UNIQUE (listing_id, date)` constraint is the whole premise of the double-booking-prevention story in 3-5. Having it in the DB from day one means Story 3-5 can focus on the Server Action logic and trust the DB to convert races into errors.

The cost is that `renter_id` is nullable until Story 3-3 lands OTP auth, and the INSERT RLS policy is permissive for now. Both are documented inline in the migration for the Story 3-5 author to tighten.

### Why the 5-day buffer is NOT enforced in the schema

The 4 + 1 post-rental buffer (FR25) is a business rule that will change. We have seen that already in the epics — at various points the discussion shifted between "3 + 2," "4 + 1," and "configurable per operator." Encoding that in a trigger or generated column means a schema migration every time the rule changes. Encoding it in the Story 3-5 Server Action means a constant change and redeploy.

The migration 00005 comment block documents this decision so a future reader knows to look for the buffer logic in `lib/actions/...`, not in the DB.

### Why column-level grants instead of a SECURITY DEFINER function

The task instructions called out a SECURITY DEFINER `get_listing_availability(...)` function as one option. We went with column-level grants for three reasons:

1. Simpler mental model: `anon can read these columns` is immediately obvious from `psql \dp public.booking_dates`, while a SECURITY DEFINER function is a black box.
2. The column list (`listing_id, date`) is already the minimum-disclosure surface. A function would just return the same subset under a different name.
3. Story 2.1 already established the column-level-grant precedent on `listings` (anon can read most columns but not `pickup_instructions`). Doing the same thing on `booking_dates` keeps the pattern consistent.
4. Supabase Realtime respects column grants. A SECURITY DEFINER function does not subscribe cleanly to `postgres_changes`; we would have had to subscribe to the table anyway, and the column grants would still have to exist.

### URL-backed selection vs Zustand

The task called out that Story 3-6 will decide the persistence strategy for the booking flow as a whole. For Story 3-2, URL params are the simplest path that satisfies the "survives refresh" requirement:

- They survive refresh because the URL is the state.
- They survive "tab restore after crash" because the URL is the state.
- They don't add a dependency (Zustand is not in the tree yet).
- They are trivially shareable (`"here's the link with my chosen dates"`).
- They compose cleanly with `useSearchParams()` hooks in child components.

The downside is that multi-step booking flow state (selected dates, verified phone, signed contract, payment intent) is too much for URL params — that is Story 3-6's problem. We deliberately isolate Story 3-2's selection state in its own hook so Story 3-6 can replace the hook's internals with Zustand without touching any consumer.

### Priority order of state collapse

The `past > booked > blocked > maintenance > available` order matters:

- `past` wins over everything: a date that is booked AND in the past should NOT render as booked — rendering it as booked lets the user read historical booking information off the calendar. Past wins, the cell goes dead grey, no information leaks.
- `booked` wins over `blocked / maintenance`: if a date is inside an operator "equipment broken" block AND someone booked it anyway (should not happen but can via edge cases in Story 3-5), we want the booking to be visible so the operator notices.
- `maintenance` wins over `blocked`: maintenance buffer is the more specific reason and the wrench icon is more informative to the renter ("the equipment needs a day of recovery") than a plain block.
- `available` is the default.

Both the server helper and the browser helper apply the same collapse, so a mid-session refetch cannot flip a cell's state.

### Inert cells use native `disabled`, not `aria-disabled`

The accessibility spec called out "not tappable" for past / booked / blocked / maintenance cells. Options:

- `aria-disabled="true"` + CSS `pointer-events: none` — screen readers still announce the cell as present, but JS has to suppress Enter/Space.
- Native HTML `disabled` — the cell cannot receive focus OR fire click/keydown, and screen readers announce "dimmed" / "disabled."

We went with native `disabled` because the cell is inside a grid and a user navigating with arrow keys benefits from the cell being in the tab order (so focus rolls over it as they arrow through) while being unclickable. Modern screen readers (NVDA, VoiceOver) announce disabled buttons in grid cells correctly.

A side effect: `fireEvent.click` on a disabled button is a no-op, which the calendar test relies on (`ignores clicks on past / booked / blocked cells`).

### Initial-render hydration vs client fetch

The Server Component passes the initial month's availability in as a prop. The `BookingFlow` `useEffect` that refetches on month change has a `initialKeyRef` guard that skips the very first render — otherwise we would double-fetch the month the server just fetched, causing a pointless flash. The guard is a ref-based "key that was fetched on the server" comparison, not a boolean, because future months are a perfectly valid re-render trigger.

### Realtime without auth

The Supabase browser client (`@/lib/supabase/client`) runs under the publishable key as anon. The realtime channel inherits that role. The two subscribed tables are both in the `supabase_realtime` publication (migration 00005 ensures it), and anon has SELECT on the safe columns of both. No session, no cookies, nothing. A renter arriving from a classifieds link gets live updates immediately.

The `postgres_changes` event payload for anon will only include the columns the role is granted to read. That is exactly what we want: the renter sees "a booking_dates row changed on this listing" without ever seeing which renter did it, which booking it belonged to, or which payment intent paid for it.

### No smoke test for the migration

The migration ships untested at the integration level because we don't have a live-DB test harness (the other migrations also ship that way). Story 3-5 will exercise the `UNIQUE (listing_id, date)` constraint via the Server Action and report any drift. The migration is simple enough that review-by-eye is sufficient for Story 3-2.

### Deferred: Desktop calendar styling

The UX spec sketches a desktop calendar variant with two months side-by-side. We ship the mobile single-month layout for Story 3-2 and treat side-by-side as a future enhancement — it is not called out in the acceptance criteria and the 480px max-width page is mobile-first anyway. When desktop mode lands, the calendar's props interface is already a pure function of `(year, month, availability, selection)` so rendering two calls side-by-side is a trivial wrapper in `BookingFlow`.

## Dev Agent Record

- Model: Claude Opus 4.6 (1M context)
- Quality gates:
  - `npm run test` → 36 files, 269 tests passing
  - `npm run lint` → 0 errors, 2 pre-existing warnings (`scripts/dev-with-bws.mjs`)
  - `npm run type-check` → clean
  - `npm run build` → clean, all routes compile, `/book/[listingId]` is partial-prerendered
- No new npm dependencies
- Files created:
  - `supabase/migrations/00005_bookings.sql`
  - `lib/services/public-availability.ts`
  - `lib/services/public-availability.test.ts`
  - `components/booking/use-booking-date-selection.ts`
  - `components/booking/use-booking-date-selection.test.ts`
  - `components/booking/renter-availability-calendar.tsx`
  - `components/booking/renter-availability-calendar.test.tsx`
  - `components/booking/booking-sticky-bar.tsx`
  - `components/booking/booking-sticky-bar.test.tsx`
  - `components/booking/booking-flow.tsx`
- Files modified:
  - `app/(renter)/book/[listingId]/page.tsx` — wire in the initial-month availability fetch and `<BookingFlow />`
  - `_bmad-output/implementation-artifacts/sprint-status.yaml` — mark story done, bump last_updated

## Follow-ups for Stories 3-3 through 3-5

- Story 3-3 will replace the `BookingStickyBar onBookNow` prop stub with a router push to `/book/[listingId]/verify`.
- Story 3-5 will:
  - Flip `bookings.renter_id` to NOT NULL once OTP auth lands (Story 3-3 dependency).
  - Tighten the `bookings` INSERT / UPDATE policies with `WITH CHECK (renter_id = auth.uid())`.
  - Implement the 4 + 1 maintenance-buffer insert (`listing_blocked_dates` rows flagged `maintenance_buffer` for `end + 1 .. end + 5`).
  - Handle `UNIQUE (listing_id, date)` collision as `BOOKING_CONFLICT` in the Server Action.
  - Write a schema smoke test if a live-DB test harness lands in the meantime.
- Story 3-6 may replace the URL-backed selection hook with a Zustand-backed store. The hook's public interface is stable and consumer-agnostic.
